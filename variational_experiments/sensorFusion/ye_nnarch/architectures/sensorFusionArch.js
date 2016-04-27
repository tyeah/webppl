var nn = require('adnn/nn');
var NNArch = require('../nnarch.js');
var ad = require('adnn/ad');
var Tensor = require('adnn/tensor');

var archname = __filename.split('/').pop().slice(0, -3);

// Really simple architecture where we predict ERP params using a multi-layer
//    perceptron of just the local features

var act = nn.tanh;
module.exports = NNArch.subclass(NNArch, archname, {

	//act: nn.relu,

	YInterface: [
	  nn.linear(2, 2),
	  //this.act,
	  act,
	  nn.linear(2, 2),
	  //this.act
	  act,
	  ],

	ZInterface: [
	  nn.linear(2, 2),
	  //this.act,
	  act,
	  nn.linear(2, 2),
	  //this.act
	  act,
	  ],

	concatNN: [
	  nn.linear(4, 2),
	  //this.act,
	  act,
	  nn.linear(2, 2),
	  ],

	compiledNN: NNArch.nnFunction(function(name) {
		var YInput = nn.ast.input();
		var ZInput = nn.ast.input();

		var YOut = nn.sequence(this.YInterface).compose(YInput);
		var ZOut = nn.sequence(this.ZInterface).compose(ZInput);

		var concatInput = nn.concat.compose(YOut, ZOut);
		var concatOutput = nn.sequence(this.concatNN).compose(concatInput);
		var concatOutputFn = nn.ast.compile([YInput, ZInput], [concatOutput]);
		return concatOutputFn;}),

	predict: function(globalStore, name) { // X should be input tensor
		var Y = new Tensor([2]).fromArray(globalStore.curY);
		var Z = new Tensor([2]).fromArray(globalStore.curZ);
		//console.log(Y);
		//console.log(Z);
		var mu = this.compiledNN(name).eval(Y, Z);
		//console.log(mu.x.data);
		return ad.tensorToScalars(mu);
		//return mu;
	}

});