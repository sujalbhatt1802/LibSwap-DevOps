const { changeCirculation } = require('./borrowController');

exports.reserveBook = changeCirculation('reserve');
