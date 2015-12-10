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

		// Return the affected bounding box
		var box = new THREE.Box2();
		box.expandByPoint(istart);
		box.expandByPoint(iend);
		box.expandByScalar(iwidth);
		box.min.floor(); box.max.ceil();
		return box;
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
		return renderBranch(branches.branch);
	} else {
		for (var brObj = branches; brObj; brObj = brObj.next) {
			renderBranch(brObj.branch);
		}
	}
}

if (typeof(window) === 'undefined') {
	module.exports = render
}