const fs = require("fs");
const path = require("path");

function normalizeObjectStore(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatJson(value, trailingNewline = false) {
  const suffix = trailingNewline ? "\n" : "";
  return `${JSON.stringify(value, null, 2)}${suffix}`;
}

function createJsonDocumentStore(options = {}) {
  const {
    filePath,
    fallbackValue = {},
    label = "json store",
    trailingNewline = false,
    normalize = (value) => value,
  } = options;

  if (!filePath || typeof filePath !== "string") {
    throw new Error("filePath is required");
  }

  function ensure() {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, formatJson(cloneJsonValue(fallbackValue), trailingNewline), "utf8");
    }
  }

  function read() {
    ensure();
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = raw.trim() ? JSON.parse(raw) : cloneJsonValue(fallbackValue);
      return normalize(parsed);
    } catch (error) {
      console.warn(`[server] failed to read ${label}`, error);
      return normalize(cloneJsonValue(fallbackValue));
    }
  }

  function write(value) {
    ensure();
    fs.writeFileSync(filePath, formatJson(value, trailingNewline), "utf8");
  }

  return {
    filePath,
    ensure,
    read,
    write,
  };
}

function createJsonObjectStore(options) {
  return createJsonDocumentStore({
    fallbackValue: {},
    normalize: normalizeObjectStore,
    ...options,
  });
}

module.exports = {
  createJsonDocumentStore,
  createJsonObjectStore,
  normalizeObjectStore,
};
