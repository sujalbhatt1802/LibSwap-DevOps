// This middleware only allows staff users to continue
const staffOnly = (req, res, next) => {

    // authMiddleware should already have added req.user
    if (!req.user) {
        return res.status(401).json({
            message: 'Authentication required'
        });
    }

    // Only users with the staff role can manage library books
    if (req.user.role !== 'staff') {
        return res.status(403).json({
            message: 'Staff access required'
        });
    }

    next();
};

module.exports = staffOnly;