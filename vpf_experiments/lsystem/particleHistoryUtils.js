
var particleHistoryUtils = {};

particleHistoryUtils.compress = function(history) {
	return history.map(function(particles) {
		var uniqueParticlesMap = {};
		var uniqueParticlesList = [];
		var indices = [];
		for (var i = 0; i < particles.length; i++) {
			var p = particles[i];
			if (!uniqueParticlesMap.hasOwnProperty(p.id)) {
				uniqueParticlesMap[p.id] = uniqueParticlesList.length;
				indices.push(uniqueParticlesList.length);
				uniqueParticlesList.push(p);
			} else {
				indices.push(uniqueParticlesMap[p.id]);
			}
		}
		return { particles: uniqueParticlesList, indices: indices };
	});
}

particleHistoryUtils.extractRelevantData = function(compressedHistory) {
	return compressedHistory.map(function(particleData) {
		return {
			indices: particleData.indices,
			particles: particleData.particles.map(function(p) {
				return {
					log_prior: p.logprior,
					log_like: p.loglike,
					log_post: p.logpost,
					active: p.active,
					similarity: p.store.sim,
					branches: p.store.branches
				}
			})
		}
	});
}

particleHistoryUtils.compressAndExtract = function(history) {
	return particleHistoryUtils.extractRelevantData(particleHistoryUtils.compress(history));
}

particleHistoryUtils.decompress = function(compressedHistory) {
	return compressedHistory.map(function(particleData) {
		for (var i = 0; i < particleData.particles.length; i++) {
			var p = particleData.particles[i];
			p.num_branches = p.branches.length;
		}
		return particleData.indices.map(function(i) {
			return particleData.particles[i];
		})
	});
}

if (typeof(window) === 'undefined') {
	module.exports = particleHistoryUtils;
}