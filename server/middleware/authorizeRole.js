const authorize = (...allowedRoles) =>  {
    return(req, res, next) => {
        if(!req.user){
            return res.status(401).json({error: 'Authentication Required'});
        }
        if(!allowedRoles.includes(req.user.role)){
            return res.status(403).json({error: 'Acces Denied. Insuffecient permissions.'});
        }

        next();
    };
}

module.exports = authorize;