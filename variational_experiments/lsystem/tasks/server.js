var _ = require('underscore');
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
		port: 8000,
		// TODO: Make these eventually be controlled by the client UI?
		target: 'a',
		numParticles: 300
	}
});
var trainedNets;
if (opts.trainedModel) {
	var nn = require('adnn/nn');
	var saved_params = __dirname + '/../saved_params';
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	var jsonNets = JSON.parse(fs.readFileSync(paramfile).toString());
	trainedNets = _.mapObject(jsonNets, function(jn) {
		return nn.deserializeJSON(jn);
	});
}
console.log(opts);

function generateResult() {
	// Initialize
	console.log('   Compiling code...');
	var file = __dirname + '/../lsystem.wppl';
	var rootdir = __dirname + '/..';
	var rets = utils.execWebpplFileWithRoot(file, rootdir);
	var globalStore = rets.globalStore;
	var generate = opts.trainedModel ? rets.generateGuided : rets.generate;
	var targetDB = rets.targetDB;
	var viewport = rets.viewport;
	var neuralNets = rets.neuralNets;
	if (opts.trainedModel) {
		for (var name in neuralNets) {
			neuralNets[name] = undefined;
		}
		_.extend(neuralNets, trainedNets);
	}

	// Run
	console.log('   Running program...');
	var saveHistory = lsysUtils.deleteStoredImages;
	globalStore.target = targetDB.getTargetByName(opts.target);
	var particleHistory;
	var t0 = present();
	utils.runwebppl(ParticleFilter, [generate, opts.numParticles, true, saveHistory], globalStore, '', function(s, ret) {
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
