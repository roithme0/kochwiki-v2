const fs = require("fs");
const path = require("path");

const versionFilePath = path.resolve(__dirname, "src", "version.ts");

const version = process.env.APP_VERSION || "0.0.0";

const versionFileContent = `// This file is auto-generated during the prebuild process.\nexport const VERSION: string = '${version}';\n`;

fs.writeFileSync(versionFilePath, versionFileContent, "utf8");
console.log(`Version file created at ${versionFilePath}`);
