class Projectile extends Entity {
    constructor(params) {
        super(params);
        params = Object.assign({
            friction: 0,
            elasticity: 0,
            life: Infinity
        }, params);
        this.friction = params.friction;
        this.elasticity = params.elasticity;
        this.life = params.life;
        this.oldPos = this.position.clone();
        this.oldVel = this.velocity.clone();
    }

    draw() {
    	this.gfx.position.x = this.position.x;
        this.gfx.position.y = this.position.y;
        if (!this.gfxDirty)
            return;

        this.gfxDirty = false;
        this.gfx.clear();
        this.gfx.lineStyle(1, this.color, 1);
        this.gfx.moveTo(0,0);
        this.gfx.lineTo(this.oldPos.x-this.position.x, this.oldPos.y-this.position.y);
    }

    frame(timescale) {
        this.oldPos = this.position.clone();
        
        super.frame(timescale);

        //apply friction
        this.velocity = this.velocity.mult(1-this.friction*timescale);
        
        //destroy projectile when it stops or expires
        if (this.velocity.isZero())
            this.world.removeEntity(this);
        if (this.age > this.life)
            this.world.removeEntity(this);

        //only redraw when speed changes significantly
        //this tolerance can be adjusted and significantly improves performance.
        if (this.velocity.sub(this.oldVel).len() > 0.5) {
            this.gfxDirty = true;
            this.oldVel = this.velocity.clone();
        }
    }

    move(dx) {
        var collisions = this.getAllCollisions(dx);

        //find nearest collision
        var nearest = null;
        var nearestDist = 0;
        collisions.forEach(collision => {
            if (collision.point === null)
                return;
            var dist = collision.point.sub(this.position).len();
            if (nearest === null || dist < nearestDist) {
                nearest = collision;
                nearestDist = dist;
            }
        });

        //if there is a collision, limit movement
        if (nearest === null)
            this.position = this.position.add(dx);
        else {
            dx = dx.unit().mult(nearest.point.sub(this.position).len() - this.radius*2);
            this.position = this.position.add(dx);
            this.emit("collision", [nearest]);
        }
    }
    
    getAllCollisions(dx) {
        //calculate a segment representing the path of this object
        var radius = dx.unit().mult(this.radius);
        var pointA = this.position.add(dx).add(radius);
        var pointB = this.position.sub(radius);

        //find any collisions
        var collisions = [];
        this.world.obstacles.forEach(object => {
            if (object instanceof Obstacle) {
                object.getSegments().forEach(segment => {
                    var point = Util.geom.segSegIntersect(pointA, pointB, segment[0], segment[1]);
                    if (point)
                        collisions.push(new Collision({
                            self: this,
                            type: Collision.SEGMENT,
                            object: segment,
                            point: point
                        }));
                });
            }
        });
        return collisions;
    }

    handleCollision(others) {
        super.handleCollision(others);
        
        var other = others[0];
        if (other && other.type === Collision.SEGMENT) {
            this.velocity = this.velocity.reflectOver(other.object[1].sub(other.object[0]))
                .mult(this.elasticity);
        }
    }
}
