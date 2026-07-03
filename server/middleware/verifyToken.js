const {verifyAccessToken} = require('../utils/generateToken')


const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer ')){
        return res.status(401).json({error: 'Acces Denied. No token provided.'});
    }

    const token = authHeader.split(' ')[1];

    try{
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        next();
    }catch (err){
        return res.status(401).json({error: 'Invalid or Expired token.x'})
    }
}

module.exports = authenticate;