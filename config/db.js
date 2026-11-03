const { MongoClient, ObjectId } = require("mongodb");
const fs = require("node:fs");
const path = require("node:path");
const engine =
  process.env.DB_ENGINE ||
  (process.env.NODE_ENV === "production" ? "mongodb" : "local");
const localPath =
  process.env.LOCAL_DB_PATH || path.join(__dirname, "../data/db.json");
let client,
  database,
  pool,
  connected = false;

function matches(doc, query) {
  return Object.entries(query).every(([key, value]) => {
    if (key === "$or") return value.some((q) => matches(doc, q));
    return String(doc[key]) === String(value);
  });
}
function cursor(rows) {
  return { toArray: async () => rows };
}
function apply(doc, update) {
  const next = { ...doc, ...update.$set };
  for (const [key, value] of Object.entries(update.$push || {}))
    next[key] = [...(doc[key] || []), value];
  return next;
}
class LocalCollection {
  constructor(name) {
    this.name = name;
  }
  read() {
    return fs.existsSync(localPath)
      ? JSON.parse(fs.readFileSync(localPath, "utf8"))
      : {};
  }
  write(store) {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath + ".tmp", JSON.stringify(store, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(localPath + ".tmp", localPath);
  }
  async find(query = {}) {
    return cursor(
      (this.read()[this.name] || []).filter((d) => matches(d, query)),
    );
  }
  async findOne(query) {
    return (await (await this.find(query)).toArray())[0] || null;
  }
  async insertOne(doc) {
    const store = this.read();
    const rows = (store[this.name] ||= []);
    if (
      this.name === "users" &&
      rows.some((r) =>
        ["username", "email", "mobile"].some((k) => r[k] === doc[k]),
      )
    )
      throw new Error("Account already exists");
    const _id = doc._id?.toString() || new ObjectId().toString();
    rows.push({ ...doc, _id });
    this.write(store);
    return { insertedId: _id };
  }
  async updateOne(query, update) {
    const store = this.read();
    const rows = store[this.name] || [];
    const index = rows.findIndex((d) => matches(d, query));
    if (index < 0) return { matchedCount: 0 };
    rows[index] = apply(rows[index], update);
    this.write(store);
    return { matchedCount: 1 };
  }
  async deleteOne(query) {
    const store = this.read();
    const rows = store[this.name] || [];
    const index = rows.findIndex((d) => matches(d, query));
    if (index < 0) return { deletedCount: 0 };
    rows.splice(index, 1);
    store[this.name] = rows;
    this.write(store);
    return { deletedCount: 1 };
  }
}
// SQL stores versioned application documents in a dedicated table. All values use
// driver parameters; document IDs remain compatible with existing Mongo records.
async function sql(statement, values = []) {
  if (engine === "postgres")
    return (
      await pool.query(
        statement.replace(
          /\?/g,
          (() => {
            let n = 0;
            return () => "$" + ++n;
          })(),
        ),
        values,
      )
    ).rows;
  return (await pool.execute(statement, values))[0];
}
class SqlCollection {
  constructor(name) {
    this.name = name;
  }
  async find(query = {}) {
    const rows = await sql(
      "SELECT document FROM devmatrix_documents WHERE collection_name = ?",
      [this.name],
    );
    return cursor(
      rows
        .map((r) =>
          typeof r.document === "string" ? JSON.parse(r.document) : r.document,
        )
        .filter((d) => matches(d, query)),
    );
  }
  async findOne(query) {
    return (await (await this.find(query)).toArray())[0] || null;
  }
  async insertOne(doc) {
    const _id = doc._id?.toString() || new ObjectId().toString();
    const unique =
      this.name === "users"
        ? [doc.username, doc.email, doc.mobile]
        : [null, null, null];
    await sql(
      "INSERT INTO devmatrix_documents (collection_name, id, document, username, email, mobile) VALUES (?, ?, ?, ?, ?, ?)",
      [this.name, _id, JSON.stringify({ ...doc, _id }), ...unique],
    );
    return { insertedId: _id };
  }
  async updateOne(query, update) {
    const doc = await this.findOne(query);
    if (!doc) return { matchedCount: 0 };
    const next = apply(doc, update);
    // Optimistic concurrency: never silently overwrite another request's update.
    const statement =
      engine === "postgres"
        ? "UPDATE devmatrix_documents SET document = ? WHERE collection_name = ? AND id = ? AND document = ?::jsonb RETURNING id"
        : "UPDATE devmatrix_documents SET document = ? WHERE collection_name = ? AND id = ? AND document = CAST(? AS JSON)";
    const result = await sql(statement, [
      JSON.stringify(next),
      this.name,
      doc._id,
      JSON.stringify(doc),
    ]);
    const count = engine === "postgres" ? result.length : result.affectedRows;
    if (!count)
      throw Object.assign(new Error("Project changed. Refresh and retry."), {
        status: 409,
      });
    return { matchedCount: count };
  }
  async deleteOne(query) {
    const doc = await this.findOne(query);
    if (!doc) return { deletedCount: 0 };
    await sql(
      "DELETE FROM devmatrix_documents WHERE collection_name = ? AND id = ?",
      [this.name, doc._id],
    );
    return { deletedCount: 1 };
  }
}
async function connectDB() {
  if (!["local", "mongodb", "postgres", "mysql"].includes(engine))
    throw new Error("Unsupported DB_ENGINE");
  if (engine === "local") {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Production requires mongodb, postgres, or mysql; local storage is ephemeral on Cloud Run",
      );
    connected = true;
    return;
  }
  if (engine === "mongodb") {
    if (!process.env.MONGO_URI && process.env.NODE_ENV === "production")
      throw new Error("MONGO_URI is required");
    client = new MongoClient(
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017",
      { serverSelectionTimeoutMS: 5000 },
    );
    await client.connect();
    database = client.db(process.env.DB_NAME || "devmatrix_db");
    for (const field of ["username", "email", "mobile"])
      await database
        .collection("users")
        .createIndex({ [field]: 1 }, { unique: true });
    await database.collection("projects").createIndex({ userId: 1 });
  } else {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is required for SQL storage");
    const tls =
      process.env.DB_SSL === "true"
        ? {
            rejectUnauthorized: true,
            ...(process.env.DB_SSL_CA_PATH
              ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, "utf8") }
              : {}),
          }
        : undefined;
    if (engine === "postgres")
      pool = new (require("pg").Pool)({
        connectionString: process.env.DATABASE_URL,
        ssl: tls,
        max: 10,
        connectionTimeoutMillis: 5000,
      });
    else
      pool = require("mysql2/promise").createPool({
        uri: process.env.DATABASE_URL,
        ssl: tls,
        connectionLimit: 10,
        connectTimeout: 5000,
      });
    await sql(`CREATE TABLE IF NOT EXISTS devmatrix_documents (
      collection_name VARCHAR(40) NOT NULL, id VARCHAR(24) NOT NULL,
      document ${engine === "postgres" ? "JSONB" : "JSON"} NOT NULL,
      username VARCHAR(100), email VARCHAR(254), mobile VARCHAR(40),
      PRIMARY KEY (collection_name, id),
      UNIQUE (collection_name, username), UNIQUE (collection_name, email), UNIQUE (collection_name, mobile)
    )`);
  }
  connected = true;
}
function getCollection(name) {
  if (engine === "local") return new LocalCollection(name);
  if (!connected) throw new Error("Database is not connected");
  return engine === "mongodb"
    ? database.collection(name)
    : new SqlCollection(name);
}
async function pingDB() {
  if (engine === "mongodb") await database.command({ ping: 1 });
  else if (engine !== "local") await sql("SELECT 1");
  else
    JSON.parse(
      fs.existsSync(localPath) ? fs.readFileSync(localPath, "utf8") : "{}",
    );
}
async function closeDB() {
  connected = false;
  await client?.close();
  await pool?.end();
}
function getStatus() {
  return {
    engine,
    connected,
    connectedToMongo: engine === "mongodb" && connected,
    fallbackActive: engine === "local",
    name: process.env.DB_NAME || "devmatrix_db",
  };
}
module.exports = {
  connectDB,
  getCollection,
  getStatus,
  pingDB,
  closeDB,
  ObjectId,
};
