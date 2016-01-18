// Convert a timestamped image sequence into a video
// Command line arguments:
// * --dir=name: Directory to read images from
//   [Optional] Defaults to ../videoImages
// * --framerate=n: Specify sampling rate
//   [Optional] Defaults to 30
// * --outputName=name: Writes out a video called ../name.mp4
//   [Optional] Defaults to ../video.mp

var fs = require('fs');
var syscall = require('child_process').execSync;
var util = require('util');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		dir: __dirname + '/../videoImages',
		framerate: 30,
		outputName: 'video',
	}
});
console.log(opts);


// Ensure images are sorted by time
var filenames = fs.readdirSync(opts.dir);
var filedata = [];
for (var i = 0; i < filenames.length; i++) {
	var fname = filenames[i];
	if (fname.slice(-4, fname.length) === '.png') {
		var time = fname.split('_')[1].slice(0, -4);
		filedata.push({
			time: parseFloat(time),
			filename: fname
		});
	}
}
filedata.sort(function(a, b) {
	if (a.time < b.time) return -1;
	else if (a.time > b.time) return 1;
	else return 0;
});


function zeropad(num, totalDigits) {
	var numstr = '' + num;
	var n = totalDigits - numstr.length;
	for (var i = 0; i < n; i++) {
		numstr = '0' + numstr;
	}
	return numstr;
}

function imageAtTime(filedata, t) {
	for (var i = 0; i < filedata.length; i++) {
		var fd = filedata[i];
		if (t < fd.time)
			return filedata[i-1];
	}
	return filedata[filedata.length-1];
}

// Do frame sampling
var fidx = 0;
var totalTime = filedata[filedata.length-1].time;
var nFrames = Math.ceil(totalTime * opts.framerate);
for (var i = 0; i <= nFrames; i++) {
	var t = i / opts.framerate;
	var fd = imageAtTime(filedata, t);
	var imgFilename = opts.dir + '/' + fd.filename;
	var frameFilename = opts.dir + '/frame_' + zeropad(fidx, 4) + '.png';
	syscall('cp ' + imgFilename + ' ' + frameFilename);
	fidx++;
}

// Create movie file
syscall(util.format('ffmpeg -framerate %d -i %s/frame_%04d.png %s/../%s.mp4',
	opts.framerate, opts.dir, __dirname, opts.outputName));

// Delete sampled frames
syscall(util.format('rm -f %s/frame_*.png', opts.dir));



