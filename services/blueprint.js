const { STACKS } = require("./pipeline");
function blueprint(project) {
  const stack = Object.hasOwn(STACKS, project.stack) ? project.stack : "node";
  const dockerfiles = {
    node: `FROM node:24-bookworm-slim\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY --chown=node:node . .\nENV NODE_ENV=production PORT=8080\nUSER node\nEXPOSE 8080\nCMD ["npm", "start"]\n`,
    java: `FROM eclipse-temurin:21-jdk AS build\nWORKDIR /source\nCOPY . .\nRUN chmod +x mvnw && ./mvnw -B package -DskipTests\nFROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY --from=build /source/target/*.jar app.jar\nENV PORT=8080\nUSER 10001\nEXPOSE 8080\nENTRYPOINT ["java", "-jar", "app.jar"]\n`,
    python: `FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nRUN useradd --create-home app\nUSER app\nENV PORT=8080\nEXPOSE 8080\nCMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port $PORT"]\n`,
  };
  const databases = {
    mongodb: "MONGO_URI=<secret-reference>\nDB_NAME=app",
    postgres: "DATABASE_URL=<postgresql-connection-secret>",
    mysql: "DATABASE_URL=<mysql-connection-secret>",
    none: "# Stateless application; no database connection required",
  };
  return {
    dockerfile: dockerfiles[stack],
    envTemplate: `# User application settings; adapt to your framework. Do not commit values.\nPORT=8080\n${Object.hasOwn(databases, project.database) ? databases[project.database] : databases.none}\n${stack === "java" ? "SERVER_PORT=8080\n" : ""}`,
    instructions: `Starter template for ${STACKS[stack].label}. Review it against your repository before use. ${stack === "java" ? "Requires Maven wrapper and one executable Spring Boot JAR; configure server.port=${PORT:8080} in application.properties." : stack === "python" ? "Requires requirements.txt, pytest, and a FastAPI object at main:app." : "Requires package-lock.json, npm start, and npm test; bind the server to process.env.PORT."} Run tests (${STACKS[stack].test}), build an image, deploy to staging, and collect evidence before production. Templates do not execute builds, provision databases, or deploy your application.`,
  };
}
module.exports = { blueprint };
