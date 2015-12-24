if (typeof(window) === 'undefined')  {
	var THREE = require('three');
}

var render = {};

render.render = function(canvas, viewport, branches, isIncremental, fillBackground) {
	if (viewport === undefined)
		viewport = {xmin: 0, ymin: 0, xmax: canvas.width, ymax: canvas.height};

	fillBackground = fillBackground === undefined ? true : fillBackground;

	var ctx = canvas.getContext('2d');

	function world2img(p) {
		return new THREE.Vector2(
			canvas.width * (p.x - viewport.xmin) / (viewport.xmax - viewport.xmin),
			canvas.height * (p.y - viewport.ymin) / (viewport.ymax - viewport.ymin)
		);
	}

	function renderBranch(branch) {
		var istart = world2img(branch.start);
		var iend = world2img(branch.end);
		var iwidth = branch.width / (viewport.xmax - viewport.xmin) * canvas.width;
		ctx.beginPath();
		ctx.lineWidth = iwidth;
		ctx.moveTo(istart.x, istart.y);
		ctx.lineTo(iend.x, iend.y);
		ctx.stroke();
	}

	if (fillBackground) {
		ctx.rect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = 'white';
		ctx.fill();
	}

	// Draw
	ctx.strokeStyle = 'black';
	ctx.lineCap = 'round';
	if (isIncremental) {
		renderBranch(branches.branch);
	} else {
		for (var brObj = branches; brObj; brObj = brObj.next) {
			renderBranch(brObj.branch);
		}
	}
}

function img2world(p, viewport, canvas) {
	return new THREE.Vector2(
		viewport.xmin + (p.x/canvas.width)*(viewport.xmax - viewport.xmin), 
		viewport.ymin + (p.y/canvas.height)*(viewport.ymax - viewport.ymin)
	);	
}

if (typeof(window) === 'undefined') {
	module.exports = { 
		render: render,
		img2world: img2world
	}
}