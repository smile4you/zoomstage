/*
zoomstage

Copyright (c) 2019 Christoph Clermont

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    } else {
        window.zoomstage = {};
        factory(null, window.zoomstage);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var mouse = {
        initialMovement: 0,
        startScreenX: 0,
        startScreenY: 0,
        deltaScreenX: 0,
        deltaScreenY: 0,
        lastDeltaScreenX: 0,
        lastDeltaScreenY: 0,
        startModelX: 0,
        startModelY: 0,
        startModelXOffset: 0,
        startModelYOffset: 0,
        startScreenCenterX: 0,
        startScreenCenterY: 0,
        startModelCenterX: 0,
        startModelCenterY: 0,
        startZoom: 0,
        shiftStartZoom: 1,
        newZoom: 0,
        startDistance: 0,
        shiftStartDistance: 0,
    };
    var mouseUpCallback = null;
    var mouseDownCallback = null;
    var zoomChangedCallback = null;
    var surpressSingleTouchPan = true;
    var transformRoot; // mindmap
    var app; // app-div
    var scrollV = generateVerticalScrollerDiv();
    var scrollH = generateHorizontalScrollerDiv();
    var singleTouchOverlay = generateSingleTouchOverlayDiv();
    var contentWidth, contentHeight;
    var curZoom = 1;
    var minZoom = 0.3;
    var maxZoom = 4;
    var curTranslateLeft = 0;
    var curTranslateTop = 0;
    var contextId = "";
    var debug = false;
    var propagated = {
        curZoom: 1,
        curTranslateLeft: 0,
        curTranslateTop: 0
    };
    var bleed = 100;
    var scrollBarTimeout = null;
    var touchCount = 0;
    var easing = {
        startMs: 0,
        offX: 0,
        offY: 0,
        startX: 0,
        startY: 0,
        duration: 800
    };
    var velocityCaptures = [];
    var velocityCaptureIndex = 0;
    for (var i = 0; i < 10; i++) {
        velocityCaptures.push({
            sX: 0,
            sY: 0,
            ms: 0
        });
    }
    var panAnimationRunning = false;
    var lastWheelEvent = new Date().getMilliseconds();
    var isTouchPad = true; // default!
    var i_am_attached = false;
    function init(config) {
        var initialZoom = config.initialZoom || 0;
        zoomChangedCallback = config.zoomChanged_Callback;
        mouseUpCallback = config.mouseUp_Callback; // will be fired when no zoom has happend
        mouseDownCallback = config.mouseDown_Callback;
        contextId = config.scopeName || "zoomstage";
        app = document.querySelector(config.stageSelector);
        transformRoot = document.querySelector(config.contentSelector);
        if (!app) {
            throw ("zoomManager: No stage [" + config.stageSelector + "] element found");
        }
        if (!transformRoot) {
            throw ("zoomManager: No content-container [" + config.contentSelector + "] element found");
        }
        contentHeight = getContentHeight();
        contentWidth = getContentWidth();
        if (!(contentWidth > 0)) {
            throw ("zoomManager: can't determine content width [" + contentWidth + "] ");
        }
        if (!(contentHeight > 0)) {
            throw ("zoomManager: can't determine content height [" + contentHeight + "] ");
        }
        curZoom = 1;
        maxZoom = config.maxZoom || 4;
        minZoom = config.minZoom || 0.1;
        // SAFARI gets extremly slow if zoom drops below 0.3 --> OK now
        // But ipad crashes with 0.1 (including complete crash :-))!
        minZoom = Math.max(minZoom, appWidth() / (contentWidth + 2 * bleed));
        //minZoom = Math.min(appWidth() / (contentWidth + 2*bleed), appHeight() / (contentHeight + 2*bleed));
        // Must be always 0 0  to let the area scale from top/left - otherwise it would simply disappear
        transformRoot.style.transformOrigin = "0px 0px";
        var centerX = contentWidth / 2;
        var centerY = contentHeight / 2;
        var fullZoom = Math.min(appWidth() / contentWidth, appHeight() / contentHeight);
        if (initialZoom >= minZoom && initialZoom <= maxZoom) {
            fullZoom = initialZoom;
        }
        scrollTo(fullZoom * 4, centerX, centerY, 0);
        window.setTimeout(function () {
            scrollTo(fullZoom, centerX, centerY, 1);
        }, 100);
        return true;
    }
    exports.init = init;
    function attach() {
        if (!i_am_attached) {
            i_am_attached = true;
            //  alert("attach zoom-manager:" + eZoomMode[mode] + "(" + mode + ")" );
            var scope = app;
            var evp = { passive: false, capture: false };
            scope.addEventListener("touchstart", onTouchStartOrMouseDown, evp);
            scope.addEventListener("touchmove", onTouchmove, evp);
            scope.addEventListener("touchend", onTouchend, evp);
            scope.addEventListener("touchcancel", onTouchend, evp);
            scope.addEventListener("wheel", onWheel);
            scope.addEventListener("mousemove", onMousemove, evp);
            scope.addEventListener("mouseup", onMouseup, evp);
            scope.addEventListener("mousedown", onTouchStartOrMouseDown, evp);
            /*
             *  Gesture Support - SAFARI on MacOs only
             */
            scope.addEventListener('gesturestart', onGestureStart, false);
            scope.addEventListener('gesturechange', onGestureChange, false);
            scope.addEventListener('gestureend', onGestureEnd, false);
            scope.appendChild(scrollV);
            scope.appendChild(scrollH);
            scope.appendChild(singleTouchOverlay);
            //recallZoomAndPan();
            // start the endless render loop
            propagateZoomAndPan();
            // setZoom(3, 0, contentWidth / 2, contentHeight / 2, undefined, undefined, true);
            // after the center animation finishes
            /* setTimeout(function() {
                 setZoom(1, 1, contentWidth / 2, contentHeight / 2, undefined, undefined, true);

                 //   center();

                 // initially, we need to remove hint, after the scale gets applied with requestRenderFrame


           //  }, 300);*/
        }
    }
    exports.attach = attach;
    function detach() {
        if (i_am_attached) {
            i_am_attached = false;
            var scope = app;
            var evp = { passive: false };
            scope.removeEventListener("touchstart", onTouchStartOrMouseDown);
            scope.removeEventListener("touchmove", onTouchmove, evp);
            scope.removeEventListener("touchend", onTouchend);
            scope.removeEventListener("touchcancel", onTouchend);
            scope.removeEventListener("wheel", onWheel);
            scope.removeEventListener("mousemove", onMousemove);
            scope.removeEventListener("mouseup", onMouseup);
            scope.removeEventListener("mousedown", onTouchStartOrMouseDown);
            scope.removeEventListener('gesturestart', onGestureStart);
            scope.removeEventListener('gesturechange', onGestureChange);
            scope.removeEventListener('gestureend', onGestureEnd);
            scrollV.remove();
            scrollH.remove();
            singleTouchOverlay.remove();
        }
    }
    exports.detach = detach;
    /*
     ***** RENDER LOOP ****
     */
    var removeAndResetWillChangeHint = 2000; // wait 2 sec on initial call before enable will-change, otherwise iPad gets blurry on loaded zoomed page
    function userInteractionStarted() {
        removeHint();
    }
    exports.userInteractionStarted = userInteractionStarted;
    function userInteractionCompleted(timeToBrowserHint) {
        if (timeToBrowserHint === void 0) { timeToBrowserHint = 500; }
        // do not overwrite a long with a short timeout
        if (timeToBrowserHint > removeAndResetWillChangeHint) {
            removeAndResetWillChangeHint = timeToBrowserHint;
            debuglog("Set hint timeout to:" + timeToBrowserHint);
        }
        else {
            debuglog("Keep current hint timeout:" + removeAndResetWillChangeHint);
        }
    }
    exports.userInteractionCompleted = userInteractionCompleted;
    function scrollTo(newZoom, modelX, modelY, animationDuration, dontPersist) {
        if (dontPersist === void 0) { dontPersist = false; }
        setZoom(newZoom, animationDuration, modelX, modelY, undefined, undefined, dontPersist);
        userInteractionCompleted();
    }
    exports.scrollTo = scrollTo;
    function screenMapCenter() {
        // coordinates of satelites are relative to the center
        return {
            pageX: (curTranslateLeft + appWidth() / 2 / curZoom) - (contentWidth / 2),
            pageY: (curTranslateTop + appHeight() / 2 / curZoom) - (contentHeight / 2)
        };
    }
    exports.screenMapCenter = screenMapCenter;
    function zoomFactor() {
        return curZoom;
    }
    exports.zoomFactor = zoomFactor;
    function touchpadOrMouse(newValue) {
        if (newValue === "touch") {
            isTouchPad = true;
        }
        if (newValue === "mouse") {
            isTouchPad = false;
        }
        return isTouchPad ? "touch" : "mouse";
    }
    exports.touchpadOrMouse = touchpadOrMouse;
    function wasTouchEvent(ev) {
        return ev.type == "touchend" || ev.type == "touchstart" || ev.type == "touchmove" || ev.type == "touchcancel";
    }
    exports.wasTouchEvent = wasTouchEvent;
    function getMouseOrTouchEventPageXY(event) {
        // External access is always AppDiv related / internal is not
        var c = getMouseOrTouchEventPageXYInternal(event);
        // simulates a very large page (the map in actual zoom dimensions)
        // Mouse is always scaled, Map-Offset isn't
        c.pageX = c.pageX - appOffsetLeft() + translateLeft() * zoomFactor();
        c.pageY = c.pageY - appOffsetTop() + translateTop() * zoomFactor();
        return c;
    }
    exports.getMouseOrTouchEventPageXY = getMouseOrTouchEventPageXY;
    /************************ END OF PUBLIC METHODS ********************************/
    function debuglog(msg, obj) {
        if (obj === void 0) { obj = null; }
        if (debug) {
            console.log(msg, obj);
        }
    }
    function getMouseOrTouchEventPageXYInternal(event, secondTouch) {
        if (secondTouch === void 0) { secondTouch = false; }
        // This method can get coordinates for both a mouse click
        // or a touch depending on the given event
        var c = { pageX: 0, pageY: 0 };
        if (event) {
            if (wasTouchEvent(event)) {
                var te = event;
                if (te && te.touches && te.touches.length > 0) {
                    if (te.touches.length > 1 && secondTouch) {
                        c.pageX = te.touches[1].pageX;
                        c.pageY = te.touches[1].pageY;
                    }
                    else {
                        c.pageX = te.touches[0].pageX;
                        c.pageY = te.touches[0].pageY;
                    }
                }
                else {
                    debugger;
                }
            }
            else {
                c.pageX = event.pageX;
                c.pageY = event.pageY;
            }
        }
        return c;
    }
    function generateSingleTouchOverlayDiv() {
        var over = document.createElement("div");
        var content = document.createElement("div");
        var text = document.createTextNode("Use two fingers to zoom and pan.");
        over.style.border = "1px rgba(255,255,255,0.7) solid";
        over.style.position = "absolute";
        over.style.display = "flex";
        over.style.alignContent = "center";
        over.style.alignItems = "center";
        over.style.opacity = "0";
        over.style.pointerEvents = "none";
        over.style.backgroundColor = "rgba(0,0,0,0.7)";
        over.style.padding = "20% 20% 20% 20%";
        over.style.transition = "opacity 1s";
        content.style.color = "white";
        content.style.fontFamily = "sans-serif";
        content.style.fontSize = "7vw";
        over.style.left = "0";
        over.style.top = "0";
        over.style.bottom = "0";
        over.style.right = "0";
        content.appendChild(text);
        over.appendChild(content);
        return over;
    }
    function generateHorizontalScrollerDiv() {
        var scrollH = generateScrollerDiv();
        scrollH.style.height = "6px";
        scrollH.style.width = "100px";
        scrollH.style.bottom = "2px";
        scrollH.style.left = "10%";
        return scrollH;
    }
    function generateVerticalScrollerDiv() {
        var scrollV = generateScrollerDiv();
        scrollV.style.height = "100px";
        scrollV.style.width = "6px";
        scrollV.style.right = "2px";
        scrollV.style.top = "10%";
        return scrollV;
    }
    function generateScrollerDiv() {
        var scroll = document.createElement("div");
        scroll.style.borderRadius = "3px";
        scroll.style.backgroundColor = "rgba(0,0,0,0.6)";
        scroll.style.border = "1px rgba(255,255,255,0.7) solid";
        scroll.style.position = "absolute";
        scroll.style.display = "none";
        return scroll;
    }
    function propagateZoomAndPan() {
        if (i_am_attached) {
            requestAnimationFrame(function () {
                if (panAnimationRunning) {
                    // get new values ...
                    panEasing();
                }
                if (propagated.curZoom !== curZoom || propagated.curTranslateLeft !== curTranslateLeft || propagated.curTranslateTop !== curTranslateTop) {
                    // apply translate as negative values
                    var tProp = "scale(" + curZoom + ") translate(" + (-curTranslateLeft) + "px," + (-curTranslateTop) + "px)";
                    transformRoot.style[transformProp] = tProp;
                    debuglog(tProp); // + "  maxScrollX=" + maxScrollX() + " maxScrollY=" + maxScrollY());
                    propagated.curZoom = curZoom;
                    propagated.curTranslateTop = curTranslateTop;
                    propagated.curTranslateLeft = curTranslateLeft;
                }
                if (removeAndResetWillChangeHint > 0) {
                    debuglog("FinalizeUserInteraction, hint after " + removeAndResetWillChangeHint);
                    var time = removeAndResetWillChangeHint;
                    removeAndResetWillChangeHint = 0;
                    removeHint();
                    setZoomCss();
                    hintBrowserIfIdle(time);
                }
                propagateZoomAndPan();
            });
        }
    }
    /*
     * **** WILL-CHANGE-HINT CONTROL *****
     */
    var browserWillChangeActive = false;
    var hintTimeoutHandle = null;
    function hintBrowserIfIdle(time) {
        if (time === void 0) { time = 500; }
        if (hintTimeoutHandle) {
            clearTimeout(hintTimeoutHandle);
        }
        // hint after some time if no other remove call happens
        debuglog("+++ HINT BROWSER IF IDLE +++");
        hintTimeoutHandle = setTimeout(hintBrowser, time);
    }
    function hintBrowser() {
        if (hintTimeoutHandle) {
            clearTimeout(hintTimeoutHandle);
            hintTimeoutHandle = null;
        }
        if (!browserWillChangeActive) {
            debuglog("--------------------------------------------");
            debuglog("Add Will-Change");
            transformRoot.style["willChange"] = "transform";
            browserWillChangeActive = true;
            var wci = document.getElementById("willChangeIndicator");
            if (wci) {
                wci.style.visibility = "visible";
            }
        }
    }
    function removeHint() {
        if (browserWillChangeActive) {
            transformRoot.style["willChange"] = "auto";
            browserWillChangeActive = false;
            debuglog("Remove Will-Change");
            debuglog("--------------------------------------------");
            var wci = document.getElementById("willChangeIndicator");
            if (wci) {
                wci.style.visibility = "hidden";
            }
        }
    }
    function translateLeft() {
        return curTranslateLeft;
    }
    function translateTop() {
        return curTranslateTop;
    }
    function appOffsetLeft() {
        return app.offsetLeft;
    }
    function appOffsetTop() {
        return app.offsetTop;
    }
    function appWidth() {
        return app.offsetWidth;
    }
    exports.appWidth = appWidth;
    function appHeight() {
        return app.offsetHeight;
    }
    exports.appHeight = appHeight;
    function getContentWidth() {
        return transformRoot.offsetWidth;
    }
    exports.getContentWidth = getContentWidth;
    function getContentHeight() {
        return transformRoot.offsetHeight;
    }
    exports.getContentHeight = getContentHeight;
    function screenToModelX(screenX) {
        return screenX / curZoom + curTranslateLeft;
    }
    function screenToModelY(screenY) {
        return screenY / curZoom + curTranslateTop;
    }
    function maxScrollY() {
        return contentHeight + (bleed) - (appHeight() / curZoom);
    }
    function maxScrollX() {
        return contentWidth + (bleed) - (appWidth() / curZoom);
    }
    function setZoom(newZoom, animate, modelX, modelY, screenX, screenY, dontPersist) {
        if (screenX === void 0) { screenX = appWidth() / 2; }
        if (screenY === void 0) { screenY = appHeight() / 2; }
        if (dontPersist === void 0) { dontPersist = false; }
        var tL, tT;
        // debuglog("Set App-Div Zoom (model: " + modelX + "/" + modelY + ")  Zoom:" + newZoom);
        newZoom = Math.max(Math.min(newZoom, maxZoom), minZoom);
        var screenCenterOffSet = {
            // divide with zoom since it is a screen value
            x: screenX / newZoom,
            y: screenY / newZoom
        };
        // we simple shift the stage to the desired model position
        // and then we deduct the screen offset
        tL = (modelX - screenCenterOffSet.x);
        tT = (modelY - screenCenterOffSet.y);
        setZoomAndScroll(newZoom, tL, tT, animate, dontPersist);
    }
    var transformProp = (function () {
        var testEl = document.createElement('div');
        if (testEl.style.transform == null) {
            var vendors = ['Webkit', 'Moz', 'ms'];
            for (var vendor in vendors) {
                if (testEl.style[vendors[vendor] + 'Transform'] !== undefined) {
                    return vendors[vendor] + 'Transform';
                }
            }
        }
        return 'transform';
    })();
    function setZoomAndScroll(z, x, y, animateSeconds, dontPersist) {
        if (animateSeconds === void 0) { animateSeconds = 0; }
        if (dontPersist === void 0) { dontPersist = false; }
        curZoom = Math.max(Math.min(z, maxZoom), minZoom);
        curTranslateLeft = Math.max(-bleed, Math.min(maxScrollX(), x));
        curTranslateTop = Math.max(-bleed, Math.min(maxScrollY(), y));
        if (animateSeconds > 0) {
            transformRoot.style.transition = "transform " + animateSeconds + "s";
        }
        else {
            transformRoot.style.transition = "none";
        }
        // we propagate to browser in request animationframe loop
        //  setZoomCss();
        if (!dontPersist) {
            saveScrollPosition();
        }
        if (zoomChangedCallback)
            zoomChangedCallback(curZoom);
    }
    function showSingleTouchOverlay() {
        if (singleTouchOverlay.style.opacity !== "1") {
            singleTouchOverlay.style.opacity = "1";
        }
    }
    function hideSingleTouchOverlay() {
        if (singleTouchOverlay.style.opacity !== "0") {
            singleTouchOverlay.style.opacity = "0";
        }
    }
    function showScrollBar() {
        if (scrollBarTimeout) {
            clearTimeout(scrollBarTimeout);
        }
        scrollV.style.display = "block";
        scrollH.style.display = "block";
        var sH = contentHeight + 2 * bleed;
        var sW = contentWidth + 2 * bleed;
        var aH = appHeight();
        var aW = appWidth();
        var h = aH / (sH * curZoom) * aH;
        if (h < 50)
            h = 50;
        scrollV.style.height = h + "px";
        scrollV.style.top = Math.max(0, (curTranslateTop / maxScrollY()) * (aH - h - 10)) + "px"; //-10 prevents scrollbar from crossing
        var w = aW / (sW * curZoom) * aW;
        if (w < 50)
            w = 50;
        scrollH.style.width = w + "px";
        scrollH.style.left = Math.max(0, (curTranslateLeft / maxScrollX()) * (aW - w - 10)) + "px";
        scrollBarTimeout = setTimeout(function () {
            scrollV.style.display = "none";
            scrollH.style.display = "none";
            userInteractionCompleted();
        }, 500); // looks weird with mouse wheel otherwise
    }
    function saveScrollPosition() {
        var view = {
            contextId: contextId,
            zoom: curZoom,
            modelX: curTranslateLeft,
            modelY: curTranslateTop
        };
        window.localStorage.setItem("view" + contextId, JSON.stringify(view));
    }
    function recallZoomAndPan() {
        var view;
        var s = window.localStorage.getItem("view" + contextId);
        if (s) {
            view = JSON.parse(s);
            if (view && view.zoom > 0) {
                setZoomAndScroll(view.zoom, view.modelX, view.modelY, 0.5, true);
                userInteractionCompleted();
                return true;
            }
        }
        setZoom(1.0, 0, contentWidth / 2, contentHeight / 2, undefined, undefined, true);
        userInteractionCompleted();
        return true;
    }
    exports.recallZoomAndPan = recallZoomAndPan;
    function setZoomCss() {
        /* Tell current zoom to to root item */
        if (curZoom < 0.5) {
            // transformRoot.setAttribute("data-draw", "block");
            // Values 0.4, 0.3 , 0.2 ,0.1 ,0.0
            //  transformRoot.setAttribute("data-zoom", "0." + Math.round(curZoom * 10));
        }
        else {
            //  transformRoot.setAttribute("data-zoom", "");
            // transformRoot.setAttribute("data-draw", "");
        }
    }
    function isTargetInputElement(target) {
        // check if text input is active
        if (target && target.nodeName) {
            var elemName = target["nodeName"].toLowerCase();
            if (elemName === "textarea" || elemName === "input") {
                return true;
            }
        }
        return false;
    }
    function isTargetAllowed(target) {
        if (target) {
            return target.closest(".no-zoom") === null;
        }
        return true;
        //  return !target || !target.classList.contains("no-zoom");
    }
    /****************************

     Use preventDefault() inside touch event handlers,
     so the default mouse-emulation handling doesn’t occur.

     For a single click the order of events is:

     touchstart
     touchmove
     touchend
     mouseover
     mousemove
     mousedown
     mouseup
     click

     **************************/
    var touchOrMousePanActive = false;
    var twoFingerTouchActive = false;
    var startTime = null;
    var Timer50msMouseDownHandle = null;
    var gestureStartZoom = 1;
    function onGestureStart(ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        gestureStartZoom = curZoom;
        //debuglog("GestureStart " + e.scale);
        hintBrowser();
    }
    function onGestureChange(ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        debuglog("GestureChange " + ev.scale + " px=" + ev.pageX + " py=" + ev.pageY);
        setZoom(gestureStartZoom * ev.scale, 0, screenToModelX(ev.pageX), screenToModelY(ev.pageY), ev.pageX, ev.pageY, false);
    }
    function onGestureEnd(ev) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        removeHint();
        hintBrowserIfIdle();
        //debuglog("GestureStart " + e.scale);
    }
    function onTouchStartOrMouseDown(ev) {
        // stop animation if running
        panAnimationRunning = false;
        mouse.initialMovement = 0;
        debuglog("ZoomManager onTouchStartOrMouseDown: pageX=" + ev.pageX + "  pageY=" + ev.pageY);
        // second finger (or more, but we only look on finger 1+2)
        // we look always for it, to execute pinch-zoom
        if (touchCount > 0 && wasTouchEvent(ev) && ev.touches.length > 1) {
            hideSingleTouchOverlay();
            hintBrowser();
            // *** second finger coming ***
            ev.preventDefault();
            // we might not have control on single touch, so we take over only for second touch and give back immedieatly
            twoFingerTouchActive = true;
            touchCount = ev.touches.length;
            debuglog("TOUCH-COUNT=" + touchCount);
            // capture second tocuh start
            var p1 = getMouseOrTouchEventPageXYInternal(ev);
            var p2 = getMouseOrTouchEventPageXYInternal(ev, true);
            mouse.startZoom = curZoom;
            mouse.newZoom = 0;
            mouse.startDistance = distance(p1.pageX, p1.pageY, p2.pageX, p2.pageY);
            mouse.startScreenCenterX = p1.pageX + (p2.pageX - p1.pageX);
            mouse.startScreenCenterY = p1.pageY + (p2.pageY - p1.pageY);
            mouse.startModelCenterX = screenToModelX(mouse.startScreenCenterX);
            mouse.startModelCenterY = screenToModelY(mouse.startScreenCenterY);
        }
        else if (isTargetAllowed(ev.target)) {
            if (wasTouchEvent(ev) && ev.touches.length === 1) {
                // no single finger pan for touch if user wants it.
                // show message instead
                if (surpressSingleTouchPan) {
                    showSingleTouchOverlay();
                }
                else {
                    touchOrMousePanActive = true;
                    ev.preventDefault();
                }
            }
            else {
                touchOrMousePanActive = true;
                ev.preventDefault();
            }
            transformRoot.style.cursor = "move"; // only visible in mouse mode
            if (wasTouchEvent(ev)) {
                hintBrowser();
                touchCount = ev.touches.length;
                debuglog("TOUCH-COUNT=" + touchCount);
            }
            captureFirstTouchOrMouseDown(ev);
            if (mouseDownCallback)
                mouseDownCallback(ev); // for deselect!!
        }
        else {
            // target not allowed (no-zoom), but if finger or mouse moves fast enough the users intention is to pan
            // so we will check the speed of mousemovement and take control if its more then 3px in the first 50ms
            if (isTargetInputElement(ev.target)) {
                return;
            }
            if (wasTouchEvent(ev) && ev.touches.length === 1 && surpressSingleTouchPan) {
                // no timer magic in this case, we are not allowed to handle a single touch anyhow
                showSingleTouchOverlay();
            }
            else {
                // prevent text selection never actually wanted in this scenarios
                ev.preventDefault();
                Timer50msMouseDownHandle = setTimeout(function () {
                    //wait 50ms to check if user intention was pan
                    Timer50msMouseDownHandle = null;
                    debuglog("initialMovement(50ms)=" + mouse.initialMovement);
                    if (mouse.initialMovement > 3) {
                        debuglog("Mouse moved in first 50ms " + (Date.now() - startTime));
                        // we take control
                        touchOrMousePanActive = true;
                        transformRoot.style.cursor = "move"; // only visible in mouse mode
                    }
                    else {
                        // cancel pan, give control back to app
                        debuglog("Mouse NOT moved in first 50ms " + (Date.now() - startTime));
                        touchOrMousePanActive = false;
                        // We possible call a delayed mouse down but the finger or mouse is not down anymore.
                        if (mouseDownCallback)
                            mouseDownCallback(ev);
                    }
                }, 50);
            }
            if (ev.target.classList.contains("selected")) {
                // cancel pan if user clicks on an already selected element
                // intention is to move this element and not the entire stage
                if (mouseDownCallback) {
                    mouseDownCallback(ev);
                    return;
                }
            }
            startTime = Date.now();
            captureFirstTouchOrMouseDown(ev);
            if (touchCount === 0 && wasTouchEvent(ev)) {
                // still capture first finger in case a second one is coming
                // captureFirstTouchOrMouseDown(ev);
                touchCount = ev.touches.length;
            }
        }
    }
    function captureFirstTouchOrMouseDown(ev) {
        var p = getMouseOrTouchEventPageXYInternal(ev); // mouseOnScaledMap(ev);#
        mouse.initialMovement = 0;
        mouse.startScreenX = p.pageX;
        mouse.startScreenY = p.pageY;
        mouse.startModelX = screenToModelX(p.pageX);
        mouse.startModelY = screenToModelY(p.pageY);
        mouse.startModelXOffset = curTranslateLeft;
        mouse.startModelYOffset = curTranslateTop;
        mouse.startZoom = curZoom;
        mouse.newZoom = 0; // used to check if zoom has happend
        mouse.deltaScreenX = 0;
        mouse.deltaScreenY = 0;
    }
    function onMousemove(ev) {
        // pre capture move delta to determine if we take control after 50ms
        mouse.initialMovement = Math.abs(mouse.startScreenX - ev.pageX) + Math.abs(mouse.startScreenY - ev.pageY);
        /* const ms = (Date.now() - startTime);

         if (ms <= 50) {
             debuglog("Mouse moved after " + ms + "ms   X=" + (mouse.startScreenX - ev.pageX) + "   Y=" + (mouse.startScreenY - ev.pageY));
         } */
        if (touchOrMousePanActive) {
            //debuglog("ev.buttons === "+ ev.buttons + " transformRoot.style.cursor === "+  transformRoot.style.cursor);
            if (ev.button === 0 && transformRoot.style.cursor === "move") {
                //if (ev.target && isTargetAllowed(ev.target)) {
                //mousePanScroll(mouseOnScaledMap(ev), 0);
                // pass just the scaled mouse on screen
                mousePanScroll(getMouseOrTouchEventPageXYInternal(ev), 0);
                showScrollBar();
                //}
            }
        }
    }
    var pinch = {
        pageX: 0,
        pageY: 0
    };
    var lastDistance = 0;
    function onTouchmove(ev) {
        // the only way to turn off native scaling in chrome / Safari / iOS10+
        // evebt must be registered as not passive
        if (ev.touches.length === 1) {
            mouse.initialMovement = Math.abs(mouse.startScreenX - ev.touches[0].pageX) + Math.abs(mouse.startScreenY - ev.touches[0].pageY);
        }
        if (touchOrMousePanActive || twoFingerTouchActive) {
            var dist = void 0;
            ev.preventDefault();
            //root.style.backgroundColor = "rgba(0,255,0,0.2)";
            // stop animation if running
            panAnimationRunning = false;
            if (!ev.shiftKey) {
                mouse.shiftStartDistance = 0;
            }
            if (ev.touches.length === 1 && ev.shiftKey) {
                /*
                    *** just for testing touch in chrome ***
                 */
                var p1 = getMouseOrTouchEventPageXYInternal(ev);
                // simulate pinch zoom
                if (mouse.shiftStartDistance === 0) {
                    debuglog("****RESET SHIFT PINCH ***");
                    pinch.pageX = p1.pageX - (300 * curZoom);
                    pinch.pageY = p1.pageY;
                    mouse.shiftStartZoom = curZoom;
                    debuglog("Set Start-Zoom to " + curZoom);
                    mouse.shiftStartDistance = distance(p1.pageX, p1.pageY, pinch.pageX, pinch.pageY);
                    mouse.startScreenCenterX = p1.pageX + (pinch.pageX - p1.pageX);
                    mouse.startScreenCenterY = p1.pageY + (pinch.pageY - p1.pageY);
                    mouse.startModelCenterX = screenToModelX(mouse.startScreenCenterX);
                    mouse.startModelCenterY = screenToModelY(mouse.startScreenCenterY);
                }
                var dist_1 = distance(p1.pageX, p1.pageY, pinch.pageX, pinch.pageY);
                if (lastDistance && ev.ctrlKey) {
                    dist_1 = lastDistance;
                }
                else {
                    lastDistance = dist_1;
                }
                var newZoom = mouse.shiftStartZoom * (dist_1 / mouse.shiftStartDistance);
                debuglog("shiftStartZoom=" + mouse.shiftStartZoom + " calc zoom=" + (dist_1 / mouse.shiftStartDistance));
                debuglog("PINCH-Distance:" + mouse.shiftStartDistance + "/" + dist_1 + " z=" + newZoom);
                // same calculation then in "mousePanScroll"
                var center = {
                    pageX: p1.pageX + (pinch.pageX - p1.pageX),
                    pageY: p1.pageY + (pinch.pageY - p1.pageY)
                };
                mouse.deltaScreenX = mouse.startScreenCenterX - center.pageX;
                mouse.deltaScreenY = mouse.startScreenCenterY - center.pageY;
                // set zoom and pan, add pan offset to model coordinates
                setZoom(newZoom, 0, mouse.startModelCenterX + mouse.deltaScreenX / curZoom, mouse.startModelCenterY + mouse.deltaScreenY / curZoom, mouse.startScreenCenterX, mouse.startScreenCenterY);
            }
            else if (ev.touches.length >= 2 && mouse.startDistance > 0 && twoFingerTouchActive) {
                /*
                 **** PINCH ZOOMING ***
                 */
                var p1 = getMouseOrTouchEventPageXYInternal(ev);
                var p2 = getMouseOrTouchEventPageXYInternal(ev, true);
                // mouse start zoom for distance
                var dist_2 = distance(p1.pageX, p1.pageY, p2.pageX, p2.pageY);
                mouse.newZoom = mouse.startZoom * (dist_2 / mouse.startDistance);
                // take center of both touches for zoom center / pan offset
                var center = {
                    pageX: p1.pageX + (p2.pageX - p1.pageX),
                    pageY: p1.pageY + (p2.pageY - p1.pageY)
                };
                // same calculation then in "mousePanScroll"
                mouse.deltaScreenX = mouse.startScreenCenterX - center.pageX;
                mouse.deltaScreenY = mouse.startScreenCenterY - center.pageY;
                // set zoom and pan, add pan offset to model coordinates
                setZoom(mouse.newZoom, 0, mouse.startModelCenterX + mouse.deltaScreenX / curZoom, mouse.startModelCenterY + mouse.deltaScreenY / curZoom, mouse.startScreenCenterX, mouse.startScreenCenterY);
            }
            else if (ev.touches.length > 0) {
                // if we did not enter pan mode initially, we should not continue now
                if (touchOrMousePanActive) {
                    //   if (ev.target && isTargetAllowed(ev.target)) {
                    mousePanScroll(getMouseOrTouchEventPageXYInternal(ev), ev.touches.length);
                    //  }
                }
            }
        }
    }
    function onMouseup(ev) {
        if (Timer50msMouseDownHandle) {
            clearTimeout(Timer50msMouseDownHandle);
        }
        if (isTargetInputElement(ev.target)) {
            return;
        }
        callMouseUpCallBack(ev);
        if (touchOrMousePanActive) {
            transformRoot.style.cursor = "auto";
            touchOrMousePanActive = false;
        }
    }
    function callMouseUpCallBack(ev) {
        // only call mouse up if no or minimal initial movement has occured
        // mouseup after pan or zoom is not what we want, since the users intention was not to click
        //mouse.initialMovement
        if (mouseUpCallback && typeof mouseUpCallback === "function") {
            if (touchOrMousePanActive) {
                // only call mouseup if no second touch was involved,
                // we need to send mouse up if no pan or zoom has happend
                // TODO: find right threshold - 2 seems to be fairly good
                if (Math.abs(mouse.deltaScreenX) + Math.abs(mouse.deltaScreenY) < 2) {
                    mouseUpCallback(ev);
                }
            }
            else {
                mouseUpCallback(ev);
            }
        }
    }
    function onTouchend(ev) {
        // debuglog("ON-TOUCH-END touchOrMousePanActive="+ touchOrMousePanActive);
        if (surpressSingleTouchPan) {
            if (ev.touches.length !== 1) {
                hideSingleTouchOverlay();
            }
            else {
                showSingleTouchOverlay();
            }
        }
        if (Timer50msMouseDownHandle) {
            clearTimeout(Timer50msMouseDownHandle);
        }
        // TODO: Hier ist das Problem, jemand touched mit einem finger, nimmt den zweiten dazu und lässt dann den ersten los
        // das führt zu einem Hässlichen springen
        if (twoFingerTouchActive) {
            if (ev.touches.length < 2) {
                twoFingerTouchActive = false;
                userInteractionCompleted();
                /*  removeHint(); // to remove will-change set in mousewheell
                  setZoomCss(); // do it now, before scroll-bar timeout (not applicabale anymore)
                  hintBrowserIfIdle(); */
            }
        }
        if (touchOrMousePanActive) {
            if (ev.touches.length > 0) {
                // am Besten wir beenden den vorgang und starten im zweifel einen neuen
                captureFirstTouchOrMouseDown(ev);
            }
            else {
                callMouseUpCallBack(ev);
                touchOrMousePanActive = false;
                mouse.lastDeltaScreenY = 0;
                mouse.lastDeltaScreenX = 0;
                startPanEasing();
            }
            touchCount = ev.touches.length;
            debuglog("TOUCH-COUNT=" + touchCount);
            mouse.startDistance = 0;
        }
        else {
            if (ev.touches.length === 0 && mouse.newZoom === 0) {
                callMouseUpCallBack(ev);
            }
        }
    }
    function distance(x1, y1, x2, y2) {
        var diffX = x2 - x1;
        var diffY = y2 - y1;
        return Math.sqrt(diffX * diffX + diffY * diffY);
    }
    // ******************************
    /*
     *    *** PAN ANIMATION ***
     */
    function startPanEasing() {
        var i, j;
        var panSpeed = { x: 0, y: 0 };
        var panVelocity = 0, dist = 0;
        var ms = Date.now();
        var velocityCapture = null;
        // find thh velocity which is 100ms ago
        /*
            i = velocityCaptureIndex;
            for (j = 0; j < 10; j++) {
                 i--;
                 if (i < 0) i = 9;
                 debuglog("velocityCaptures[" + i + "] " + (ms-velocityCaptures[i].ms), velocityCaptures[i]);
             }
        */
        i = velocityCaptureIndex;
        for (j = 0; j < 10; j++) {
            i--;
            if (i < 0)
                i = 9;
            if (velocityCaptures[i].ms > 0) {
                var msDiff = ms - velocityCaptures[i].ms;
                if (msDiff > 20) {
                    // this happend aprox. 20-50ms ago
                    debuglog("CATCH Velocity Time Diff:" + msDiff + "ms + Dist=" + Math.sqrt(Math.pow(velocityCaptures[i].sX, 2) + Math.pow(velocityCaptures[i].sY, 2)));
                    velocityCapture = velocityCaptures[i];
                    break;
                }
                else {
                    debuglog("SKIPPED Velocity Time Diff:" + msDiff + "ms");
                }
            }
        }
        // calculate speed
        if (velocityCapture && (velocityCapture.sX || velocityCapture.sY)) {
            var elapsed = ms - velocityCapture.ms;
            var delta = {
                x: velocityCapture.sX,
                y: velocityCapture.sY
            };
            if (delta.x || delta.y) {
                dist = Math.sqrt(Math.pow(delta.x, 2) + Math.pow(delta.y, 2));
                // limit velocity to a max of 1px/ms  = 1000px/s
                panVelocity = dist / elapsed; // Math.max(1, dist / elapsed / 100);
                // normalize speed vector
                panSpeed.x = -delta.x / dist;
                panSpeed.y = -delta.y / dist;
            }
            easing.startMs = Date.now();
            // if speed is to slow animation does not make so much sense
            if (panVelocity > 0) {
                easing.startX = curTranslateLeft;
                easing.startY = curTranslateTop;
                easing.offX = (panVelocity * easing.duration) * panSpeed.x;
                easing.offY = (panVelocity * easing.duration) * panSpeed.y;
                if (Math.abs(easing.offX) > 100 || Math.abs(easing.offY) > 100) {
                    // we dont start an animation under 100px movement
                    panAnimationRunning = true;
                    requestAnimationFrame(panEasing);
                }
                else {
                    debuglog("Pan animation canceld, to less movement");
                }
            }
        }
        // reset velocity ringbuffer
        for (var j_1 = 0; j_1 < 10; j_1++) {
            velocityCaptures[j_1].ms = 0;
        }
        if (!panAnimationRunning) {
            finalizePanEasing();
        }
    }
    function panEasing() {
        var elapsedMs = Date.now() - easing.startMs;
        if (panAnimationRunning && elapsedMs <= easing.duration) {
            // time position (0-1)
            var t = (elapsedMs / easing.duration);
            t = easingFunction(t);
            var sX = easing.startX + (easing.offX / curZoom * t);
            var sY = easing.startY + (easing.offY / curZoom * t);
            setZoomAndScroll(curZoom, sX, sY, 0, true);
        }
        else {
            finalizePanEasing();
        }
    }
    function finalizePanEasing() {
        saveScrollPosition();
        panAnimationRunning = false;
        // seems we only need if zoom > 1 to unblur the view
        if (curZoom > 1) {
            removeHint();
            hintBrowserIfIdle();
        }
    }
    function easingFunction(t) {
        return t * (2 - t);
    }
    /*
     ***** MOUSE CONTROL DISPLAYS *****
     */
    function mousePanScroll(p, touches, zoom) {
        if (zoom === void 0) { zoom = curZoom; }
        mouse.deltaScreenX = mouse.startScreenX - p.pageX;
        mouse.deltaScreenY = mouse.startScreenY - p.pageY;
        // set left/top point of stage
        var sX = mouse.startModelXOffset + (mouse.deltaScreenX / curZoom);
        var sY = mouse.startModelYOffset + (mouse.deltaScreenY / curZoom);
        // ring buffer for pan animation
        if (touches === 1) {
            // This is what devices do, only a single touch can set an impulse to scrolling
            velocityCaptures[velocityCaptureIndex] = {
                sX: -mouse.deltaScreenX - mouse.lastDeltaScreenX,
                sY: -mouse.deltaScreenY - mouse.lastDeltaScreenY,
                ms: Date.now()
            };
            mouse.lastDeltaScreenX = -mouse.deltaScreenX;
            mouse.lastDeltaScreenY = -mouse.deltaScreenY;
            velocityCaptureIndex++;
            if (velocityCaptureIndex === 10)
                velocityCaptureIndex = 0;
            //         debuglog("velocityCaptureIndex: " + velocityCaptureIndex);
        }
        else {
            // invalidate buffer
            velocityCaptureIndex = 0;
            for (var i = 0; i < 10; i++) {
                velocityCaptures[i].ms = 0;
            }
        }
        setZoomAndScroll(zoom, sX, sY, 0);
    }
    function onWheel(ev) {
        ev.preventDefault();
        var newZoom = curZoom;
        var modelX = screenToModelX(ev.pageX);
        var modelY = screenToModelY(ev.pageY);
        if (isTouchPad) {
            //https://stackblitz.com/edit/multi-touch-trackpad-gesture
            if (ev.ctrlKey) {
                newZoom = curZoom - ev.deltaY * 0.01;
            }
            else {
                modelX -= ev.deltaX * 1.5 / curZoom;
                modelY -= ev.deltaY * 1.5 / curZoom;
            }
        }
        else {
            // Just mouse-wheel zoom, no pan;
            var ms = new Date().getMilliseconds() - lastWheelEvent;
            var faktor = (Math.max(Math.min(30, ms), 10) - 10); // 0-20
            faktor = 1.01 + faktor / 20 * 0.09;
            lastWheelEvent = new Date().getMilliseconds();
            // delta is extrem device spezifisch und komplett unbrauchbar
            if (ev.deltaY >= 0) {
                newZoom = curZoom / faktor;
            }
            else {
                newZoom = curZoom * faktor;
            }
        }
        // hintBrowser(); //creates artefacts on safari and chrome
        setZoom(newZoom, 0, modelX, modelY, ev.pageX, ev.pageY, false);
        showScrollBar();
    }
});