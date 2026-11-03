const { getCollection, ObjectId } = require("../config/db");
const bcrypt = require("bcryptjs");

class User {
  static collection() {
    return getCollection("users");
  }

  static async findByUsername(username) {
    if (!username) return null;
    return await this.collection().findOne({
      username: username.toLowerCase().trim(),
    });
  }

  static async findByEmail(email) {
    if (!email) return null;
    return await this.collection().findOne({
      email: email.toLowerCase().trim(),
    });
  }

  static async findByMobile(mobile) {
    if (!mobile) return null;
    const cleaned = mobile.trim();
    return await this.collection().findOne({ mobile: cleaned });
  }

  static async findById(id) {
    if (!id) return null;
    try {
      let query = { _id: id };
      if (typeof id === "string" && id.length === 24) {
        query = { $or: [{ _id: id }, { _id: new ObjectId(id) }] };
      }
      return await this.collection().findOne(query);
    } catch {
      return await this.collection().findOne({ _id: id });
    }
  }

  // Find user by username OR email OR mobile for flexible login
  static async findByIdentifier(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim();
    const cleanLower = clean.toLowerCase();

    const col = this.collection();
    const user = await col.findOne({
      $or: [{ username: cleanLower }, { email: cleanLower }, { mobile: clean }],
    });
    return user;
  }

  static async create({
    firstName,
    lastName,
    username,
    email,
    mobile,
    password,
  }) {
    // Basic validations
    if (!firstName || !lastName || !firstName.trim() || !lastName.trim()) {
      throw new Error("First name and Last name are required.");
    }
    if (!username || username.trim().length < 3) {
      throw new Error("Username must be at least 3 characters.");
    }
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }
    if (!mobile || mobile.trim().length < 7) {
      throw new Error("A valid mobile number is required.");
    }
    if (!password || password.length < 12) {
      throw new Error("Password must be at least 12 characters long.");
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobile.trim();

    // Check uniqueness
    const existingUser = await this.collection().findOne({
      $or: [
        { username: cleanUsername },
        { email: cleanEmail },
        { mobile: cleanMobile },
      ],
    });

    if (existingUser) {
      if (existingUser.username === cleanUsername) {
        throw new Error("Username is already taken. Please choose another.");
      }
      if (existingUser.email === cleanEmail) {
        throw new Error("Email ID is already registered.");
      }
      if (existingUser.mobile === cleanMobile) {
        throw new Error("Mobile number is already registered.");
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username: cleanUsername,
      email: cleanEmail,
      mobile: cleanMobile,
      passwordHash,
      role: "user",
      support: { status: "new", notes: "", updatedAt: null, updatedBy: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await this.collection().insertOne(newUser);
    newUser._id = res.insertedId;
    delete newUser.passwordHash;
    return newUser;
  }

  static async verifyPassword(plainPassword, passwordHash) {
    return await bcrypt.compare(plainPassword, passwordHash);
  }
}

module.exports = User;
