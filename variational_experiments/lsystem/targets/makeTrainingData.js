var fs = require('fs');
var util = require('util');
var syscall = require('child_process').execSync;

var sourceDir = __dirname + '/source';
var trainingDir = __dirname + '/training';

var SMALL_SIZE = 50;

var imgs = fs.readdirSync(sourceDir).filter(function(filename) {
	return filename.slice(-4) === '.png'; 
});
for (var i = 0; i < imgs.length; i++) {
	var img = imgs[i];
	console.log('Converting ' + img + '...');
	var sourcename = sourceDir + '/' + img;
	var trainingname = trainingDir + '/' + img;
	syscall(util.format('convert %s -resize %dx%d -colorspace Gray %s',
		sourcename, SMALL_SIZE, SMALL_SIZE, trainingname));
	var flopname = util.format('%s/%s_flop.png', trainingDir, img.slice(0, -4));
	syscall(util.format('convert %s -flop %s',
		trainingname, flopname));
}
console.log('DONE.');