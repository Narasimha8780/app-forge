const { getCollection, ObjectId } = require("../config/db");
const { createCleanStages, STAGES } = require("../services/pipeline");
function createCleanEnvVars() {
  return [];
}
function createCleanIntegrations() {
  return [];
}
class Project {
  static collection() {
    return getCollection("projects");
  }
  static async findByUserId(userId) {
    return (await this.collection().find({ userId: String(userId) })).toArray();
  }
  static async findById(id) {
    if (!id || !/^[a-f\d]{24}$/i.test(String(id))) return null;
    return this.collection().findOne({
      $or: [{ _id: String(id) }, { _id: new ObjectId(id) }],
    });
  }
  static async createDefault(
    userId,
    name = "Untitled application",
    options = {},
  ) {
    const project = {
      _id: new ObjectId().toString(),
      userId: String(userId),
      name,
      description:
        "Your delivery workspace. Start with a clear brief, then progress with evidence.",
      stack: options.stack || "node",
      database: options.database || "postgres",
      framework: options.stack || "node",
      deploymentType: "cloud",
      cloudProvider: null,
      brief: {},
      pipelineStages: createCleanStages(),
      envVars: [],
      integrations: [],
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.collection().insertOne(project);
    return project;
  }
  static async save(project, changes) {
    const query = { _id: project._id, updatedAt: project.updatedAt };
    if (project.revision !== undefined) query.revision = project.revision;
    const next = {
      ...changes,
      revision: (project.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const result = await this.collection().updateOne(query, { $set: next });
    if (!result.matchedCount)
      throw Object.assign(
        new Error("This project changed. Refresh and retry."),
        { status: 409 },
      );
    return { ...project, ...next };
  }
  static async updateName(id, name) {
    const p = await this.findById(id);
    if (!p) throw new Error("Project not found");
    await this.save(p, { name: name.trim() });
    return name.trim();
  }
  static async deleteProject(id) {
    const p = await this.findById(id);
    if (p) await this.collection().deleteOne({ _id: p._id });
  }
}
module.exports = {
  Project,
  createCleanStages,
  createCleanEnvVars,
  createCleanIntegrations,
  STAGES_BLUEPRINT: STAGES,
};
