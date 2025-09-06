const express = require("express");
const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  const containerId = require("fs").existsSync("/.dockerenv")
    ? require("child_process").execSync("hostname").toString().trim()
    : "N/A";
  res.send(`
    <h1>Hello from our Node.js application!</h1>
    <p>This is running inside a Docker container.</p>
    <p>Container ID: ${containerId}</p>
  `);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
