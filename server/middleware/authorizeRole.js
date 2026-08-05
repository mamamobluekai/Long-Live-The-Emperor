const authorize = (...allowedRoles) =>  {
    const normalizedRoles = allowedRoles.map((role) => String(role).toLowerCase());

    return(req, res, next) => {
        if(!req.user){
            return res.status(401).json({error: 'Authentication Required'});
        }

        const userRole = String(req.user.role || '').toLowerCase();
        if(!normalizedRoles.includes(userRole)){
            return res.status(403).json({error: 'Acces Denied. Insuffecient permissions.'});
        }

        next();
    };
}

module.exports = authorize;