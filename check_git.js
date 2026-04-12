const { execSync } = require('child_process');
console.log(execSync('git log -n 10 --oneline').toString());
