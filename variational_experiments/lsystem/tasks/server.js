var http = require('http');
var assert = require('assert');
var utils = require('../../utils.js');
var webppl = require('../../../src/main.js');
var lsysUtils = require('../utils.js');
var particleHistoryUtils = require('../particleHistoryUtils.js');


// TODO: Read from command line?
// var targetName = 'curl';
// var targetName = 'bifurcate';
var targetName = 'a';
// var targetName = 'heart';
// var targetName = 'manybranch_3';
// var targetName = 'manybranch_4';
// var targetName = 'manybranch_7';
// var targetName = 'snake_3';
// var targetName = 'spiral';
// var targetName = 't';


function handleRequest(request, response){
	console.log('Request received:');

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
	globalStore.target = targetDB.getTargetByName(targetName);
	var particleHistory;
	utils.runwebppl(ParticleFilter, [generate, nParticles, true, saveHistory], globalStore, '', function(s, ret) {
		particleHistory = ret.particleHistory;
	});
	var result = {
		targetName: targetName,
		viewport: viewport,
		history: particleHistoryUtils.compress(particleHistory)
	};

	// Respond
	console.log('   Done; sending response.');
	response.end(JSON.stringify(result));
}

var server = http.createServer(handleRequest);

var PORT = 8000;
server.listen(PORT, function(){
    console.log("Server listening on http://localhost:%s", PORT);
});
