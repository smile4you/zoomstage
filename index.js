// Import stylesheets
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./zoomstage"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var zoomstage = require("./zoomstage");
    // Write TypeScript code!
    var stageDiv = document.getElementById('stage');
    //stageDiv.innerHTML =
    var selectedElement = null;
    var m = {
        pageX: 0,
        pageY: 0,
        blockX: 0,
        blockY: 0,
        div: null
    };
    /*
       Init call passes the smaller stage-div-id and the larger content-div to zoom and pan.
       Since zoomStage needs to steel the mouse and touch events
       - user likes to pan and pinch zoom everywhere on screen -
       we pass event listeners for mouse down and up to zoomStage. (Event-Delegaton)
       Its just called "mouse" but it passes touch events as well.
    */
    zoomstage.init({
        stageSelector: "#stage",
        contentSelector: "#content",
        initialZoom: 0,
        minZoom: 0,
        maxZoom: 0,
        mouseDown_Callback: function (ev) {
            var div = ev.target;
            deselect(); // always deselect
            if (div && div.classList.contains("block")) {
                /*
                  Use a zoomStage helper to get pageX/pageY for. mouse or touch
                */
                var p = zoomstage.getMouseOrTouchEventPageXY(ev);
                /*
                  Tell zoomStage that some user interaction will happen so zoomStage can release
                  the will change attribute on the stage.
                  By not calling "userInteractionStarted" stage-content gets blurry
                */
                zoomstage.userInteractionStarted();
                div.classList.add("selected");
                m.pageX = p.pageX;
                m.pageY = p.pageY;
                m.blockX = parseInt(div.style.left.replace("px", ""));
                m.blockY = parseInt(div.style.top.replace("px", ""));
                m.div = div;
                document.addEventListener("mousemove", mouseMove);
                document.addEventListener("mouseup", mouseUpOnce);
            }
        },
        mouseUp_Callback: function (ev) {
            var div = ev.target;
            if (!div || !div.classList.contains("block")) {
                deselect();
            }
            // indicate mouse up callback
            document.getElementById("content").style.backgroundColor = "rgba(255,255,255,0.1)";
            window.setTimeout(function () { return document.getElementById("content").style.backgroundColor = null; }, 100);
        },
        scopeName: "",
        zoomChanged_Callback: null
    });
    zoomstage.attach();
    /*
    let  center = zoomstage.screenMapCenter();
    zoomstage.scrollTo(3, 2500,1500,0);
    window.setTimeout(function() {
        zoomstage.scrollTo(0.8, 1500,1000,1)
    }, 100);
    
    */
    function deselect() {
        document.querySelectorAll(".selected").forEach(function (ele) { ele.classList.remove("selected"); });
    }
    function mouseMove(ev) {
        var p = zoomstage.getMouseOrTouchEventPageXY(ev);
        m.div.style.left = (m.blockX + (p.pageX - m.pageX) / zoomstage.zoomFactor()) + "px";
        m.div.style.top = (m.blockY + (p.pageY - m.pageY) / zoomstage.zoomFactor()) + "px";
    }
    function mouseUpOnce(ev) {
        // alert("up" + selectedElement.className)
        document.removeEventListener("mouseup", mouseUpOnce);
        document.removeEventListener("mousemove", mouseMove);
    }
});
//# sourceMappingURL=index.js.map