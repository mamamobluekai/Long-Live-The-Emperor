const jwt = require('jsonwebtoken')
const crypto = require('crypto')

// Every token now carries a unique `jti`. Access-token jti values are used by
// the deny-list in utils/tokenStore.js so a logged-out token can be revoked
// before its natural expiry; refresh-token jti values are the rotation key.
const newJti = () => crypto.randomUUID()

// Pin the algorithm explicitly. Without this, verification would accept any
// algorithm the token header claims, which is the classic `alg: none` /
// algorithm-confusion weakness (CWE-347).
const SIGN_OPTIONS = { algorithm: 'HS256' }

function assertSecret() {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured. Refusing to sign or verify tokens.');
    }
}

const generateAccessToken = (user) =>  {
    assertSecret()
    return jwt.sign(
    {
        id: user.id,
        email: user.email,
        role: user.role,
        jti: user.jti || newJti(),
        type: 'access',

    },
    process.env.JWT_SECRET,
    {
     ...SIGN_OPTIONS,
     expiresIn: '1h'
    }

    )

}

const generateRefreshToken = (user) => {
    assertSecret()
    const jti = user.jti || newJti()
    const token = jwt.sign(
        {id: user.id, jti, type: 'refresh'},
        process.env.JWT_SECRET,
        {...SIGN_OPTIONS, expiresIn: "7d"}
    )
    // Return the token plus its jti so callers can persist the rotation record.
    return { token, jti }
}
const verifyAccessToken = (token) => {
    assertSecret()
    // Pinning `algorithms` rejects `alg: none` and algorithm-confusion forgeries.
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

const verifyRefreshToken = (token) =>{
    assertSecret()
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })

}
module.exports = {generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken};