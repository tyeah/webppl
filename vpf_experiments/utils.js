var fs = require('fs');

function loadTraces(filename) {
	var lines = fs.readFileSync(filename).toString().split('\n');
	if (lines[lines.length-1] === '') {
		lines.splice(lines.length-1, 1);
	}
	return lines.map(function(line) {
		return JSON.parse(line);
	});
}

module.exports = {
	loadTraces: loadTraces
};