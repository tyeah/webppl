var http = require('http');
var assert = require('assert');
var fs = require('fs');
var present = require('present');
var utils = require('../../utils.js');
var webppl = require('../../../src/main.js');
var lsysUtils = require('../utils.js');
var particleHistoryUtils = require('../particleHistoryUtils.js');


// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		target: 'a',
		port: 8000
	}
});
console.log('Target = ' + opts.target);

function generateResult() {
	// Initialize
	console.log('   Compiling code...');
	var file = __dirname + '/../lsystem.wppl';
	var rootdir = __dirname + '/..';
	var rets = utils.execWebpplFileWithRoot(file, rootdir);
	var globalStore = rets.globalStore;
	var generate = rets.generate;
	var targetDB = rets.targetDB;
	var viewport = rets.viewport;

	// Run
	console.log('   Running program...');
	var saveHistory = lsysUtils.deleteStoredImages;
	var nParticles = 300;
	globalStore.target = targetDB.getTargetByName(opts.target);
	var particleHistory;
	var t0 = present();
	utils.runwebppl(ParticleFilter, [generate, nParticles, true, saveHistory], globalStore, '', function(s, ret) {
		particleHistory = ret.particleHistory;
		var t1 = present();
		console.log('   (Time taken: ' + (t1-t0)/1000 + ')');
	});
	var result = {
		targetName: opts.target,
		viewport: viewport,
		history: particleHistoryUtils.compress(particleHistory)
	};

	// Finish
	return JSON.stringify(result);
}

function fetchAsset(path) {
	var filename = __dirname + '/..' + path;
	if (!fs.existsSync(filename)) {
		console.log('   Requested asset does not exist; ignoring.');
	} else {
		return fs.readFileSync(filename);
	}
}

function handleRequest(request, response) {
	console.log('Request received: ' + request.url);
	var respContents;
	if (request.url === '/generate') {
		console.log('   [Generating result]');
		respContents = generateResult();
	} else {
		console.log('   [Fetching static asset]');
		var path = request.url === '/' ? '/test_ui.html' : request.url;
		respContents = fetchAsset(path);
	}
	console.log('   Done.');
	response.end(respContents);
}


var server = http.createServer(handleRequest);

server.listen(opts.port, function(){
    console.log("Server listening on http://localhost:%s", opts.port);
});
