const bcrypt = require('bcrypt')

const SALT_ROUNDS = 12;

const hashPassword = async (password) =>{
    return await bcrypt.hash(password,SALT_ROUNDS);
}

const comparePassword = async(password, hashPassword) => {
    return await bcrypt.hash(password, hashPassword)
}

module.exports = {hashPassword, comparePassword};