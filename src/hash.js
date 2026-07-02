// only test to get the hash password 

const bcrypt = require("bcrypt");

async function generateHash() {
  const hash = await bcrypt.hash("123456", 10);

  console.log(hash);
}

generateHash();