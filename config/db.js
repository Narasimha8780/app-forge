const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.DB_NAME || 'devmatrix_db';
const LOCAL_DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

let client = null;
let nativeDb = null;
let isConnected = false;
let lastError = null;

// Ensure data folder exists
if (!fs.existsSync(path.dirname(LOCAL_DB_PATH))) {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
}

// In-Memory / File-based MongoDB compatible fallback adapter
class LocalFallbackCollection {
  constructor(name) {
    this.name = name;
  }

  _readStore() {
    try {
      if (fs.existsSync(LOCAL_DB_PATH)) {
        const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn(`[LocalDB] Error reading fallback file: ${e.message}`);
    }
    return {};
  }

  _writeStore(data) {
    try {
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error(`[LocalDB] Error writing fallback file: ${e.message}`);
    }
  }

  _getCollection() {
    const store = this._readStore();
    if (!store[this.name]) {
      store[this.name] = [];
      this._writeStore(store);
    }
    return store[this.name];
  }

  async find(query = {}) {
    const list = this._getCollection();
    const filtered = list.filter(item => this._matchesQuery(item, query));
    return {
      toArray: async () => filtered,
      sort: () => ({
        toArray: async () => filtered
      }),
      limit: (n) => ({
        toArray: async () => filtered.slice(0, n)
      })
    };
  }

  async findOne(query = {}) {
    const list = this._getCollection();
    const item = list.find(it => this._matchesQuery(it, query));
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async insertOne(doc) {
    const store = this._readStore();
    if (!store[this.name]) store[this.name] = [];
    const item = { ...doc };
    if (!item._id) {
      item._id = new ObjectId().toString();
    } else if (typeof item._id === 'object') {
      item._id = item._id.toString();
    }
    store[this.name].push(item);
    this._writeStore(store);
    return { acknowledged: true, insertedId: item._id };
  }

  async updateOne(query, update) {
    const store = this._readStore();
    if (!store[this.name]) store[this.name] = [];
    const list = store[this.name];
    const idx = list.findIndex(it => this._matchesQuery(it, query));
    if (idx === -1) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }

    let doc = list[idx];
    if (update.$set) {
      doc = { ...doc, ...update.$set };
    }
    if (update.$push) {
      for (const [key, val] of Object.entries(update.$push)) {
        if (!Array.isArray(doc[key])) doc[key] = [];
        doc[key].push(val);
      }
    }
    list[idx] = doc;
    this._writeStore(store);
    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }

  async deleteOne(query) {
    const store = this._readStore();
    if (!store[this.name]) return { acknowledged: true, deletedCount: 0 };
    const originalLen = store[this.name].length;
    store[this.name] = store[this.name].filter(it => !this._matchesQuery(it, query));
    const deletedCount = originalLen - store[this.name].length;
    this._writeStore(store);
    return { acknowledged: true, deletedCount };
  }

  async countDocuments(query = {}) {
    const list = this._getCollection();
    return list.filter(item => this._matchesQuery(item, query)).length;
  }

  _matchesQuery(item, query) {
    if (!query || Object.keys(query).length === 0) return true;
    for (const key of Object.keys(query)) {
      const qVal = query[key];
      const itVal = item[key];

      if (key === '$or' && Array.isArray(qVal)) {
        const matchesOr = qVal.some(subQuery => this._matchesQuery(item, subQuery));
        if (!matchesOr) return false;
        continue;
      }

      if (key === '_id') {
        const strId = itVal ? itVal.toString() : '';
        const qId = qVal ? qVal.toString() : '';
        if (strId !== qId) return false;
        continue;
      }

      if (typeof qVal === 'object' && qVal !== null) {
        if (qVal.$regex) {
          const regex = new RegExp(qVal.$regex, qVal.$options || '');
          if (!regex.test(String(itVal || ''))) return false;
          continue;
        }
        if (qVal.$in && Array.isArray(qVal.$in)) {
          if (!qVal.$in.includes(itVal)) return false;
          continue;
        }
      }

      if (itVal !== qVal) return false;
    }
    return true;
  }
}

async function connectDB() {
  try {
    console.log(`[Database] Attempting connection to MongoDB at ${MONGO_URI}/${DB_NAME}...`);
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });
    await client.connect();
    nativeDb = client.db(DB_NAME);
    isConnected = true;
    lastError = null;
    console.log(`[Database] Connected successfully to MongoDB (${MONGO_URI}/${DB_NAME})`);
    return nativeDb;
  } catch (err) {
    isConnected = false;
    lastError = err.message;
    console.warn(`[Database] Could not connect directly to MongoDB (${err.message}).`);
    console.warn(`[Database] Resilient Local Store Active in: ${LOCAL_DB_PATH}`);
    return null;
  }
}

// Background auto-reconnect retry every 15 seconds if disconnected
setInterval(async () => {
  if (!isConnected) {
    try {
      const newClient = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000
      });
      await newClient.connect();
      client = newClient;
      nativeDb = client.db(DB_NAME);
      isConnected = true;
      lastError = null;
      console.log(`[Database] Re-connected to MongoDB on localhost:27017!`);
    } catch {
      // Keep fallback active silently
    }
  }
}, 15000);

function getCollection(name) {
  if (isConnected && nativeDb) {
    return nativeDb.collection(name);
  }
  return new LocalFallbackCollection(name);
}

function getStatus() {
  return {
    connectedToMongo: isConnected,
    uri: `${MONGO_URI}/${DB_NAME}`,
    lastError,
    fallbackActive: !isConnected,
    localDbFile: LOCAL_DB_PATH
  };
}

module.exports = {
  connectDB,
  getCollection,
  getStatus,
  ObjectId
};

