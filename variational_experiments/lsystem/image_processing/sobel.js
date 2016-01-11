var ad = require('adnn/ad');
var nn = require('adnn/nn');
var Tensor = require('adnn/tensor');

//Horizontal and vertical filters
var SOBEL_X_FILTER = [[-1, 0, 1],
                      [-2, 0, 2],
                      [-1, 0, 1]]; 

var SOBEL_Y_FILTER = [[1, 2, 1],
                      [0, 0, 0],
                      [-1, -2, -1]];  

var x_filter = ad.params([1, 1, 3, 3], 'sobel_x');
var y_filter = ad.params([1, 1, 3, 3], 'sobel_y');
var biases = ad.params([1, 1, 1, 1], 'biases');
ad.value(x_filter).fromArray(SOBEL_X_FILTER);
ad.value(y_filter).fromArray(SOBEL_Y_FILTER);
ad.value(biases).fromArray([0]);

//Stride: 1
//Biases: none
//Pad: 1
function sobel(img) {
	var grad_x = nn.convolve(img, x_filter, biases, 1, 1, 1, 1);
	var grad_y = nn.convolve(img, y_filter, biases, 1, 1, 1, 1);

	//Compute magnitude
	var grad = new Tensor([grad_x.x.dims[0], grad_x.x.dims[1], grad_x.x.dims[2]]);
	grad.fill(0);

	var numEntries = grad_x.x.dims[1]*grad_x.x.dims[2];

	for (var i = 0; i < numEntries; i++) {
		grad.data[i] = Math.sqrt(grad_x.x.data[i]*grad_x.x.data[i] + grad_y.x.data[i]*grad_y.x.data[i]);
	}

	return grad;
}

module.exports = {
	sobel: sobel, 
};