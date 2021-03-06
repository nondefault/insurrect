class NavMesh extends Emitter {
	/**
	 * Params:
	 * agentRadius: the minimum radius of agents using the NavMesh. Used to offset walkable area.
	 * DEBUG: whether to render debug view
	 */
	constructor(params) {
		super(params);
		if (!("world" in params))
			throw new Error("Must specify world.");

		params = Object.assign(params, {
			agentRadius: 7.5,
			DEBUG: false
		});

		this.world = params.world;
		this.DEBUG = params.DEBUG;
		this.agentRadius = params.agentRadius;
		this._epsilon = 1e-4;
		this.pathPolys = null;
		this.jobs = [];
	}

	/**
	 * Updates the NavMesh to account for modified level geometry.
	 */
	rebuild() {
		let t0 = performance.now();
		try {
			this.triangulate();
		} catch (e) {
			console.log("Triangulation failed.");
			return;
		}
		this.buildGraph();
		console.log("NavMesh rebuild took %s ms.", (performance.now()-t0).toFixed(2));
	}

	/**
	 * Computes walkable area and triangulates it.
	 * This updates the internal list of walkable polygons.
	 */
	triangulate() {
		//invert world geometry (compute walkable areas)
		let bounds = this.world.getBounds();
		let polys = this.world.obstacles.map(obstacle => obstacle.poly);
		let holes = Polygon.union(polys, polys);
		holes = Polygon.offset(holes, this.agentRadius-this._epsilon*2);
		holes = Polygon.simplify(holes);

		//this is REALLY bad--fix polygon adjacency test for vertical/horizontal segments
		//it works by adding a small random value to every vertex
		holes = holes.map(hole => new Polygon(hole.points.map(p => p.add(Vector.random(-this._epsilon,this._epsilon)))))
		
		//subtract offset obstacle geometry from world bounds (invert) 
		holes.forEach(hole => bounds.addHole(hole));
		this.polys = holes;

		//triangulate walkable area
		let ctx = bounds.toP2TContext();
		ctx.triangulate();
		let triangles = ctx.getTriangles();
		let output = triangles.map(tri => Polygon.fromP2TTriangle(tri));
		this.polys = output;
		this.centers = this.polys.map(poly => poly.getCentroid());
	}

	/**
	 * Builds a graph of adjacent walkable polygons.
	 * Should call triangulate() first.
	 * This updates the internal adjacency graph.
	 */
	buildGraph() {
		this.graph = new Graph();
		this.polys.forEach(poly => {
			this.polys.forEach(other => {
				if (poly.adjacentTo(other))
					this.graph.addEdge(poly, other);
			});
		});
	}

	/**
	 * Finds a list of polygons that connect pointA and pointB.
	 * Both points must be contained by a polygon in this NavMesh.
	 * This method will THROW if pathfinding fails.
	 * @param pointA the source point
	 * @param pointB the destination point
	 */
	_findGlobalPath(pointA, pointB) {
		//locate points in walkability polygons
		let src = this.polys.find(poly => poly.contains(pointA));
		let dst = this.polys.find(poly => poly.contains(pointB));
		if (typeof src === "undefined")
			throw new Error("Source point not contained in navmesh.");
		if (typeof dst === "undefined")
			throw new Error("Destination point not contained in navmesh.");

		//perform search
		let dist = (a,b) => a.getCentroid().sub(b.getCentroid()).len();
		let heuristic = dist;
		this.pathPolys = this.graph.aStar(src, dst, dist, heuristic); //output polygons
		return this.pathPolys;
	}

	_findPath(pointA, pointB) {
		//find path and map polygons to their centroids.
		let points = this._findGlobalPath(pointA, pointB)
			.map(poly => poly.getCentroid());

		//include source and destination points
		//caveat: A* is not aware of this information; paths may be unoptimal
		points.unshift(pointA);
		points.push(pointB);

		//begin line of sight testing to reduce path complexity
		let out = [points[0]];
		let polys = [this.pathPolys[0]];
		let prev = 0;
		for (let i=1; i<points.length-1; i++) {
			let lineOfSight = new Segment(points[prev], points[i+1]);

			//offsets help to reduce collisions with corners
			//effectively raycasts from center and both sides of entities
			let offsets = [
				new Vector(),
				Vector.fromDir(lineOfSight.dir()-Math.PI*0.5, this.agentRadius*2),
				Vector.fromDir(lineOfSight.dir()+Math.PI*0.5, this.agentRadius*2)
			];

			//do LoS testing
			let hit = false;
			outer: for (let offset of offsets) {
				let segments = this.world.segSpace.getIntersecting(lineOfSight.add(offset));
				for (let segment of segments) {
					if (Util.geom.segSegIntersect(lineOfSight.add(offset), segment)) {
						hit = true;
						break outer;
					}
				}
			}

			//if there is a clear LoS, this point is unnecessary.
			if (!hit)
				continue;
			
			//otherwise, add the point to the output
			out.push(points[i]);
			polys.push(this.pathPolys[i]);
			prev = i;
		}

		//add the final point
		out.push(points[points.length-1]);
		polys.push(this.pathPolys[this.pathPolys.length-1]);
		this.pathPolys = polys;
		return out;
	}

	/**
	 * Computes a list of waypoints from pointA to pointB.
	 * This is the function that should generally be used to compute paths.
	 * Depends on findGlobalPath(); see its documentation.
	 * @param pointA the source point
	 * @param pointB the destination point
	 */
	findPath(pointA, pointB) {
		return new Promise((resolve, reject) => {
			this.jobs.push(() => {
				try {
					let path = this._findPath(pointA, pointB);
					resolve(path);
				}
				catch (e) {
					resolve(null);
				}
			});
		});
	}

	processJobs() {
		if (this.jobs.length > 0) {
			let job = this.jobs.shift();
			job.call(this);
		}
	}

	drawDebug(gfx) {
		if (!this.polys || !this.DEBUG)
			return;

		//render triangles
		this.polys.forEach(poly => {
			let n = poly.points[0].sub(GameScene.view).sub(GameScene.viewOffset);
			gfx.lineStyle(1, 0xFF0000, 0.25);
			gfx.moveTo(n.x, n.y);
			for (let i=0,j=poly.points.length; i<j; i++) {
				let m = poly.points[(i+1)%j].sub(GameScene.view).sub(GameScene.viewOffset);
				gfx.lineTo(m.x, m.y);
			}
		});

		this.polys.forEach(poly => {
			let n = poly.points[0].sub(GameScene.view).sub(GameScene.viewOffset);
			for (let i=0,j=poly.points.length; i<j; i++) {
				let m = poly.points[(i+1)%j].sub(GameScene.view).sub(GameScene.viewOffset);
				gfx.beginFill(0xFFFF00, 1);
				gfx.drawRect(m.x,m.y,1,1);
				gfx.endFill();
			}
		});

		//render connections
		gfx.lineStyle(1, 0x00FF00, 1);
		for (let i=0,j=this.graph.edges.length; i<j; i+=1) {
			let edge = this.graph.edges[i];
			let cA = edge[0].getCentroid().sub(GameScene.view).sub(GameScene.viewOffset);
			let cB = edge[1].getCentroid().sub(GameScene.view).sub(GameScene.viewOffset);
			gfx.moveTo(cA.x, cA.y);
			gfx.lineTo(cB.x, cB.y);
		}
	}
}
