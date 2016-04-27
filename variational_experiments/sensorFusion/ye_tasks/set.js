var utils = require('../../utils.js');

var rootdir = __dirname + '/..'; // here __dirname is where this js file locates
var file = rootdir + '/ye_programs/fake.wppl';
var rets = utils.execWebpplFileWithRoot(file, rootdir); //rets is the return value of file(wppl file)
console.log(rets);

var globalStore = rets.globalStore; // used to pass values from fake.wppl to set.js
globalStore.hidden = 0.8; // can be passed to rets.generate via runwebppl
globalStore.hey = true;

var g = rets.generate;
utils.runwebppl(Enumerate, [g], globalStore, '', function(s, ret) {
  console.log(s);//s is globalStore
  console.log(ret);//ret is the ERP got by Enumerate(g)
  console.log(ret.support());
  console.log(Math.exp(ret.score([], true)));
  console.log(Math.exp(ret.score([], false)));
});
