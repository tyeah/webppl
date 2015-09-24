module.exports = {
	linear: function(i, n) {
		return Math.max(i/n, 0.001);
	},
	linearStop: function(stop) {
		return function(i, n) {
			var stopi = stop*n;
			return Math.min(1, Math.max(i/stopi, 0.001));
		}
	},
	asymptotic: function(rate) {
		return function(i, n) {
			var x = i/n + 0.001;
			return Math.max(0.001, 1 + (1 / (-rate*x)));
		}
	}
};