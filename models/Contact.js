const { getCollection } = require("../config/db");

class Contact {
  static collection() {
    return getCollection("contacts");
  }

  static async create({
    name,
    email,
    phone,
    subject,
    message,
    preferredCloud,
  }) {
    if (!name || !email || !message) {
      throw new Error("Name, Email and Message are required.");
    }

    const doc = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : "",
      subject: subject
        ? subject.trim()
        : "App Development & Deployment Inquiry",
      message: message.trim(),
      preferredCloud: preferredCloud || "AWS / Cloud Provider",
      status: "new",
      createdAt: new Date().toISOString(),
    };

    const res = await this.collection().insertOne(doc);
    doc._id = res.insertedId;
    return doc;
  }

  static async listAll() {
    const res = await this.collection().find({});
    return await res.toArray();
  }
}

module.exports = Contact;
