// Start up an instance of a server that allows interactive exploration of
//    program outputs.
// Command line arguments:
// * --program=name: Runs the WebPPL program in programs/name.wppl
// * --port=number: To use the UI, point your browser at localhost:number
//   [Optional] Defaults to 8000
// * --target=name: Uses target image named 'name'
//   [Optional] Defaults to 'a'
// * --numParticles=number: Control how many SMC particles are used
//   [Optional] Defaults to 300
// * --trainedModel=name: Load neural nets from saved_params/name.txt
//   [Optional] If omitted, will use the prior program
// * --sampler=[smc|mh]: Which sampling algorithm to use
//   [Optional] Defaults to smc


var _ = require('underscore');
var http = require('http');
var assert = require('assert');
var fs = require('fs');
var present = require('present');
var utils = require('../../utils.js');
var webppl = require('../../../src/main.js');
var lsysUtils = require('../utils.js');
var particleHistoryUtils = require('../particleHistoryUtils.js');
var nnarch = require('../nnarch');
var qs = require('querystring');

// Parse options
var opts = require('minimist')(process.argv.slice(2), {
	default: {
		port: 8000,
		// TODO: Make these eventually be controlled by the client UI?
		target: 'a',
		numParticles: 300,
		sampler: 'smc'
	}
});
var program = opts.program;
assert(program, 'Must define --program option');
var nnGuide;
if (opts.trainedModel) {
	var saved_params = __dirname + '/../saved_params';
	var paramfile = saved_params + '/' + opts.trainedModel + '.txt';
	nnGuide = nnarch.loadFromFile(paramfile);
}
console.log(opts);

// Compile ahead-of-time
console.log('   Compiling code...');
var file = __dirname + '/../programs/' + program + '.wppl';
var rootdir = __dirname + '/..';
var rets = utils.execWebpplFileWithRoot(file, rootdir);
var globalStore = rets.globalStore;
var generate = opts.trainedModel ? rets.generateGuided : rets.generate;
var targetDB = rets.targetDB;
var renderSize = rets.renderSize || targetDB.targetSize();
var viewport = rets.viewport;
if (opts.trainedModel) {
	globalStore.nnGuide = nnGuide;
}

function generateResult() {
	// Run
	console.log('   Running program...');
	var saveHistory = lsysUtils.deleteStoredImages;
	if (targetDB) {
		globalStore.target = targetDB.getTargetByName(opts.target);
	}
	var particleHistory;
	var t0 = present();
	if (opts.sampler === 'smc') {
		utils.runwebppl(ParticleFilter, [generate, opts.numParticles, true, saveHistory, true], globalStore, '', function(s, ret) {
			particleHistory = ret.particleHistory;
			var t1 = present();
			console.log('   (Time taken: ' + (t1-t0)/1000 + ')');
		});
	} else if (opts.sampler === 'mh') {
		var mhopts = {
			justSample: true
		};
		utils.runwebppl(HashMH, [generate, opts.numParticles, mhopts], globalStore, '', function(s, ret) {
			particleHistory = [ret.samples];
			var t1 = present();
			console.log('   (Time taken: ' + (t1-t0)/1000 + ')');
		});
	} else {
		throw 'Unrecognized sampler ' + opts.sampler;
	}
	var result = {
		targetName: targetDB ? opts.target : undefined,
		targetSize: renderSize,
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

function saveImage(filename, data) {
	var base64Data = data.replace(/^data:image\/png;base64,/, '');
	fs.writeFile(filename, base64Data, 'base64');
}

function handleRequest(request, response) {
	console.log('Request received: ' + request.url);
	if (request.method === 'POST') {
		var body = '';
        request.on('data', function(data) {
            body += data;
        });
        request.on('end',function() {
        	var respContents;
            var POST = qs.parse(body);
            if (request.url === '/saveImage') {
            	console.log('   [Saving image ' + POST.imgFilename + ']');
            	saveImage(POST.imgFilename, POST.imgData);
            }
            response.end(respContents);
        });
	} else {
		var respContents;
		if (request.url === '/generate') {
			console.log('   [Generating result]');
			respContents = generateResult();
		} else {
			console.log('   [Fetching static asset]');
			var path = request.url === '/' ? '/test_ui.html' : request.url;
			respContents = fetchAsset(path);
		}
		response.end(respContents);
	}
}


var server = http.createServer(handleRequest);

server.listen(opts.port, function(){
    console.log("Server listening on http://localhost:%s", opts.port);
});
