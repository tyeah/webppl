var http = require('http');
var assert = require('assert');
var fs = require('fs');
var webppl = require('../../../src/main.js');


var webpplfn;
function compileCode() {
	assert(process.argv.length === 3, 'usage: node server.js webppl_code_filename');
	var codefile = process.argv[2];
	var code = fs.readFileSync(codefile);
	compiledcode = webppl.compile(code);
	webpplfn = eval(compiledcode);
}

function runprog() {
	// My webppl files expect to be run from the repo root.
	var rootdir = __dirname + '/../../..';
	var cwd = process.cwd();
	process.chdir(rootdir);

	var ret;
	webpplfn({}, function(s, retval) {
		ret = retval;
	}, '');

	process.chdir(cwd);
	return ret;
}

function handleRequest(request, response){
	console.log('Request received:');
	console.log('   Compiling code...');
	compileCode();
	console.log('   Running program...');
	var result = runprog();
	console.log('   Done; sending response.');
	response.end(JSON.stringify(result));
}


// ---------------------------------------------------------------

var server = http.createServer(handleRequest);

var PORT = 8000; 
server.listen(PORT, function(){
    console.log("Server listening on http://localhost:%s", PORT);
});