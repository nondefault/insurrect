var TitleScene = {
	stage: null,
	t0: 0,

	init: function() {
		TitleScene.stage = new PIXI.Container();
		TitleScene.gfx = new PIXI.Graphics();
		TitleScene.title = PIXI.Sprite.from(Core.image.title);
		TitleScene.stage.addChild(TitleScene.gfx);
		TitleScene.stage.addChild(TitleScene.title);

		//create buttons
		TitleScene.playbtn = Display.makeButton("let's go", Core.color.acc3, Core.color.acc1, function(){
			Game.start();
		});
		Display.centerObj(TitleScene.playbtn, true, false);
		TitleScene.playbtn.position.y = 180;
		TitleScene.stage.addChild(TitleScene.playbtn);
	},
	
	/**
	 * Called when a scene regains focus.
	 */
	activate: function() {
		TitleScene.t0 = Game.time;
	},

	/**
	 * Called when a scene loses focus.
	 */
	deactivate: function() {

	},

	frame: function(timescale) {
		var t = Game.time - TitleScene.t0;
		TitleScene.title.position.x = (Display.w-TitleScene.title.width)/2;
		var f = 1 - Math.pow(Math.max(0, 1-t/1.5), 2);
		TitleScene.title.position.y = Math.floor(-f * 30 + 40);
		TitleScene.title.alpha = f;

		TitleScene.playbtn.position.y = Math.floor(Display.h - 80 + f*20);
		TitleScene.playbtn.alpha = f;

		//draw background
		TitleScene.gfx.clear();
		TitleScene.gfx.beginFill(Core.color.bg1, 1);
		TitleScene.gfx.drawRect(0, 0, Display.w, Display.h);
		TitleScene.gfx.endFill();
	}
};