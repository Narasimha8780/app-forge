const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const { JWT_SECRET } = require("../config/security");

// A fresh account/sign-in cancels a GitHub linking flow started by another
// platform account in this browser.
function clearPendingGitHub(res) {
  res.clearCookie("devmatrix_github_oauth", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/github/callback",
  });
}

// Helper to sign JWT
function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

// Middleware: verify JWT
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authentication required. Please sign in.",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired session. Please sign in again.",
    });
  }
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      mobile,
      password,
      confirmPassword,
    } = req.body;
    if (
      ![
        firstName,
        lastName,
        username,
        email,
        mobile,
        password,
        confirmPassword,
      ].every((v) => typeof v === "string" && v.length <= 254) ||
      username.length > 100 ||
      mobile.length > 40 ||
      password.length > 72 ||
      Buffer.byteLength(password, "utf8") > 72
    )
      return res.status(400).json({
        success: false,
        error:
          "Provide valid text fields; passwords must be at most 72 UTF-8 bytes.",
      });

    if (!firstName.trim() || !lastName.trim()) {
      return res.status(400).json({
        success: false,
        error: "First name and Last name are required.",
      });
    }
    if (!username || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: "Username must be at least 3 characters.",
      });
    }
    if (!email || !email.includes("@")) {
      return res
        .status(400)
        .json({ success: false, error: "A valid email ID is required." });
    }
    if (!mobile || mobile.trim().length < 7) {
      return res
        .status(400)
        .json({ success: false, error: "A valid mobile number is required." });
    }
    if (!password || password.length < 12) {
      return res.status(400).json({
        success: false,
        error: "Password must be at least 12 characters.",
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: "Password and Confirm Password do not match.",
      });
    }

    const newUser = await User.create({
      firstName,
      lastName,
      username,
      email,
      mobile,
      password,
    });

    clearPendingGitHub(res);
    return res.status(201).json({
      success: true,
      message: "Registration successful. Please sign in to continue.",
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        username: newUser.username,
        email: newUser.email,
        mobile: newUser.mobile,
      },
    });
  } catch (err) {
    console.error("[Auth Register Error]:", err.message);
    return res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/auth/login
// Supports login via username, email ID, OR mobile number
router.post("/login", async (req, res) => {
  try {
    const { loginIdentifier, password } = req.body;

    if (
      typeof loginIdentifier !== "string" ||
      typeof password !== "string" ||
      !loginIdentifier ||
      !password ||
      loginIdentifier.length > 254 ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Please enter your username, email, or mobile number, along with your password.",
      });
    }

    const user = await User.findByIdentifier(loginIdentifier);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Invalid sign-in details.",
      });
    }

    const isMatch = await User.verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: "Invalid sign-in details.",
      });
    }

    const token = generateToken(user);

    clearPendingGitHub(res);
    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
      },
    });
  } catch (err) {
    console.error("[Auth Login Error]:", err.message);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error during login." });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        mobile: user.mobile,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = {
  router,
  authMiddleware,
};
