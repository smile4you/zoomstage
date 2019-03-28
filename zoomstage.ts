/*
zoomstage.net

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

interface iView {
    contextId: string
    zoom: number
    modelX: number
    modelY: number
}

type iZoomChangeCallback = (zoom: number) => any;
type iMouseCallback = (ev: Event) => any;

let mouse = {

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

    startScrollbarTop: 0,
    startScrollbarLeft: 0

};


enum edgeScrollDirectionE {
    up = "up",
    down = "down",
    left = "left",
    right = "right",
    none = "none"
}

enum scrollBarDragE {
    none = "none",
    horizontal = "horizontal",
    vertical = "vertical"
}

let mouseUpCallback: iMouseCallback = null;
let mouseDownCallback: iMouseCallback = null;
let zoomChangedCallback: iZoomChangeCallback = null;
let surpressSingleTouchPan = true;
let transformRoot: HTMLDivElement; // mindmap
let app: HTMLDivElement;  // app-div
let scrollV: HTMLDivElement = generateVerticalScrollerDiv();
let scrollH: HTMLDivElement = generateHorizontalScrollerDiv();
let scrollAreaV: HTMLDivElement = generateVerticalScrollAreaDiv();
let scrollAreaH: HTMLDivElement = generateHorizontalScrollAreaDiv();
let singleTouchOverlay = generateSingleTouchOverlayDiv();
let contentWidth: number, contentHeight: number;
let curZoom: number = 1;
let minZoom: number = 0.3;
let maxZoom: number = 4;
let curTranslateLeft = 0;
let curTranslateTop = 0;
let contextId: string = "";
let debug = false;

let edgeScroll = true; // scroll if mouse comes close to the edge of the stage, should be sctivated on mouse down (drag mode only)
const edgeScrollZonePixel = 40;
const edgeScrollAmountPixel = 8;
let edgeScrollDirection: edgeScrollDirectionE = edgeScrollDirectionE.none;

let propagated = {
    curZoom: 1,
    curTranslateLeft: 0,
    curTranslateTop: 0
};

let bleed = 100;
let scrollBarTimeout: any = null;

let touchCount = 0;

let easing = {
    startMs: 0,
    offX: 0,
    offY: 0,
    startX: 0,
    startY: 0,
    duration: 800
};


interface iVector2D {
    x: number;
    y: number;
}


let velocityCaptures: iCapture[] = [];
let velocityCaptureIndex: number = 0;
for (let i = 0; i < 10; i++) {
    velocityCaptures.push({
        sX: 0,
        sY: 0,
        ms: 0
    })
}

interface iCapture {
    sX: number,
    sY: number,
    ms: number
}

let panAnimationRunning: boolean = false;

let lastWheelEvent = new Date().getMilliseconds();
let isTouchPad = true; // default!
let hasMousePanOnNoZoomItems = false; // default!
let i_am_attached = false;

/*********************** PUBLIC METHODS ******************/

export interface initProperties {
    stageSelector: string,
    contentSelector: string,
    initialZoom: number;
    minZoom: number;
    maxZoom: number;
    scopeName: string,
    mouseDown_Callback: iMouseCallback,
    mouseUp_Callback: iMouseCallback,
    zoomChanged_Callback: iZoomChangeCallback,
    bleed: number,
    edgeScroll: true,
    mousePanOnNoZoomItems: false
}

export function init(config: initProperties): boolean {

    if (i_am_attached) {
        console.error("Zoomstage is already attached to", app);
        return false;
    }

    const initialZoom = config.initialZoom || 0;

    let skipInitAnimation = false;
    if (initialZoom === -1) {
        skipInitAnimation = true;
    }

    if (config.bleed >= 0) {
        bleed = config.bleed;
    }

    if (typeof config.edgeScroll === "boolean") {
        edgeScroll = config.edgeScroll;
    }

    if (typeof config.mousePanOnNoZoomItems === "boolean") {
        hasMousePanOnNoZoomItems = config.mousePanOnNoZoomItems;
    }

    zoomChangedCallback = config.zoomChanged_Callback;
    mouseUpCallback = config.mouseUp_Callback; // will be fired when no zoom has happend
    mouseDownCallback = config.mouseDown_Callback;
    contextId = config.scopeName || "zoomstage";

    app = <HTMLDivElement>document.querySelector(config.stageSelector);
    transformRoot = <HTMLDivElement>document.querySelector(config.contentSelector);


    if (!app) {
        throw ("zoomstage: No stage [" + config.stageSelector + "] element found");
    }
    if (!transformRoot) {
        throw ("zoomstage: No content-container [" + config.contentSelector + "] element found");
    }

    contentHeight = getContentHeight();
    contentWidth = getContentWidth();

    if (!(contentWidth > 0)) {
        throw ("zoomstage: can't determine content width [" + contentWidth + "] ");
    }

    if (!(contentHeight > 0)) {
        throw ("zoomstage: can't determine content height [" + contentHeight + "] ");
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
    transformRoot.style.position = "relative";
    app.style.overflow = "hidden";

    const ps = getComputedStyle(app).position;
    if (!ps || ps === "static") {
        app.style.position = "relative";
        // we need this as a minimum to get scroll bar placement probably
    }

    let centerX = contentWidth / 2;
    let centerY = contentHeight / 2;
    let fullZoom = Math.min(appWidth() / contentWidth, appHeight() / contentHeight);
    if (initialZoom >= minZoom && initialZoom <= maxZoom) {
        fullZoom = initialZoom;
    }

    if (!skipInitAnimation) {
        scrollTo(fullZoom * 4, centerX, centerY, 0);
        window.setTimeout(function () {
            scrollTo(fullZoom, centerX, centerY, 1)
        }, 100);

    }

    return true;
}


export function attach() {

    if (!i_am_attached) {
        detach();
    }
    i_am_attached = true;
    //  alert("attach zoom-manager:" + eZoomMode[mode] + "(" + mode + ")" );

    let scope = app;

    const evp: any = {passive: false, capture: false};
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

    scope.appendChild(scrollAreaV);
    scope.appendChild(scrollAreaH);
    scrollAreaV.addEventListener('mousedown', onVerticalScrollAreaDown);
    scrollAreaH.addEventListener('mousedown', onHorizontalScrollAreaDown);


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


export function detach() {
    if (i_am_attached) {
        i_am_attached = false;

        let scope: any = app;

        const evp: any = {passive: false};
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

/*
 ***** RENDER LOOP ****
 */
let removeAndResetWillChangeHint: number = 2000; // wait 2 sec on initial call before enable will-change, otherwise iPad gets blurry on loaded zoomed page
export function userInteractionStarted() {
    removeHint();
}

export function userInteractionCompleted(timeToBrowserHint: number = 500) {
    // do not overwrite a long with a short timeout
    if (timeToBrowserHint > removeAndResetWillChangeHint) {
        removeAndResetWillChangeHint = timeToBrowserHint;
        debuglog("Set hint timeout to:" + timeToBrowserHint);
    } else {
        debuglog("Keep current hint timeout:" + removeAndResetWillChangeHint);
    }
}

export function scrollTo(newZoom, modelX: number, modelY: number, animationDuration: number, dontPersist: boolean = false) {
    setZoom(newZoom, animationDuration, modelX, modelY, undefined, undefined, dontPersist);
    userInteractionCompleted();
}

export function screenMapCenter(): iPageXY {
    // coordinates of satelites are relative to the center
    return {
        pageX: (curTranslateLeft + appWidth() / 2 / curZoom) - (contentWidth / 2),
        pageY: (curTranslateTop + appHeight() / 2 / curZoom) - (contentHeight / 2)
    }
}

export function zoomFactor() {
    return curZoom;
}


export function touchpadOrMouse(newValue?): string {
    if (newValue === "touch") {
        isTouchPad = true;
    }
    if (newValue === "mouse") {
        isTouchPad = false;
    }
    return isTouchPad ? "touch" : "mouse";

}

export function mousePanOnNoZoomItems(newValue?): string {
    if (newValue === "touch") {
        hasMousePanOnNoZoomItems = true;
    }
    if (newValue === "mouse") {
        hasMousePanOnNoZoomItems = false;
    }
    return isTouchPad ? "touch" : "mouse";

}

export function wasTouchEvent(ev: any) {
    return ev.type == "touchend" || ev.type == "touchstart" || ev.type == "touchmove" || ev.type == "touchcancel";
}

export interface iPageXY {
    pageX: number;
    pageY: number;
}

export function getMouseOrTouchEventPageXY(event: Event): iPageXY {
    // External access is always AppDiv related / internal is not
    const c = getMouseOrTouchEventPageXYInternal(event);

    // simulates a very large page (the map in actual zoom dimensions)
    // Mouse is always scaled, Map-Offset isn't
    c.pageX = c.pageX - appOffsetLeft() + translateLeft() * zoomFactor();
    c.pageY = c.pageY - appOffsetTop() + translateTop() * zoomFactor();

    return c;
}

/************************ END OF PUBLIC METHODS ********************************/











function debuglog(msg: string, obj: any = null) {
    if (debug) {
        console.log(msg, obj)
    }
}

function getMouseOrTouchEventPageXYInternal(event: Event, secondTouch: boolean = false): iPageXY {
    // This method can get coordinates for both a mouse click
    // or a touch depending on the given event
    let c: iPageXY = {pageX: 0, pageY: 0};
    if (event) {
        if (wasTouchEvent(event)) {
            let te = (<TouchEvent>event);
            if (te && te.touches && te.touches.length > 0) {
                if (te.touches.length > 1 && secondTouch) {
                    c.pageX = te.touches[1].pageX;
                    c.pageY = te.touches[1].pageY;
                } else {
                    c.pageX = te.touches[0].pageX;
                    c.pageY = te.touches[0].pageY;
                }

            } else {
                debugger;
            }

        } else {
            c.pageX = (<MouseEvent>event).pageX;
            c.pageY = (<MouseEvent>event).pageY;
        }

    }
    return c;
}


function generateSingleTouchOverlayDiv() {
    const over = document.createElement("div");
    const content = document.createElement("div");
    let text = document.createTextNode("Use two fingers to zoom and pan.");


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
    const scrollH = generateScrollerDiv();
    scrollH.style.height = "6px";
    scrollH.style.width = "100px";
    scrollH.style.bottom = "6px";
    scrollH.style.left = "10%";
    return scrollH;
}

function generateVerticalScrollerDiv() {
    const scrollV = generateScrollerDiv();
    scrollV.style.height = "100px";
    scrollV.style.width = "6px";
    scrollV.style.right = "6px";
    scrollV.style.top = "10%";
    return scrollV;
}

function generateScrollerDiv() {
    const scroll = document.createElement("div");
    scroll.style.borderRadius = "3px";
    scroll.style.backgroundColor = "rgba(0,0,0,0.6)";
    scroll.style.border = "1px rgba(255,255,255,0.7) solid";
    scroll.style.position = "absolute";
    scroll.style.display = "none";
    scroll.style.cursor = "pointer";
    scroll.style.pointerEvents = "none";
    return scroll;
}


function generateHorizontalScrollAreaDiv() {
    const scrollH = generateScrollAreaDiv();
    scrollH.style.height = "15px";
    scrollH.style.right = "0";
    scrollH.style.bottom = "0";
    scrollH.style.left = "0";
    return scrollH;
}

function generateVerticalScrollAreaDiv() {
    const scrollV = generateScrollAreaDiv();
    scrollV.style.width = "15px";
    scrollV.style.right = "0";
    scrollV.style.top = "0";
    scrollV.style.bottom = "0";
    return scrollV;
}

function generateScrollAreaDiv() {
    const scroll = document.createElement("div");
    scroll.style.position = "absolute";
    scroll.style.cursor = "pointer";
    return scroll;
}


function propagateZoomAndPan() {
    if (i_am_attached) {

        requestAnimationFrame(function () {
            if (panAnimationRunning) {
                // get new values ...
                panEasing();
            }

            let changes = (propagated.curZoom !== curZoom || propagated.curTranslateLeft !== curTranslateLeft || propagated.curTranslateTop !== curTranslateTop);

            if (!changes) {
                switch (edgeScrollDirection) {
                    case edgeScrollDirectionE.down:
                        curTranslateTop = Math.max(-bleed, Math.min(maxScrollY(), curTranslateTop + edgeScrollAmountPixel));
                        //console.log("SCROLLED DOWN");
                        showScrollBar();
                        break;
                    case edgeScrollDirectionE.up:
                        curTranslateTop = Math.max(-bleed, Math.min(maxScrollY(), curTranslateTop - edgeScrollAmountPixel));
                        //console.log("SCROLLED UP");
                        showScrollBar();
                        break;
                    case edgeScrollDirectionE.left:
                        curTranslateLeft = Math.max(-bleed, Math.min(maxScrollX(), curTranslateLeft - edgeScrollAmountPixel));
                        //console.log("SCROLLED LEFT");
                        showScrollBar();
                        break;
                    case edgeScrollDirectionE.right:
                        curTranslateLeft = Math.max(-bleed, Math.min(maxScrollX(), curTranslateLeft + edgeScrollAmountPixel));
                        //console.log("SCROLLED RIGHT");
                        showScrollBar();
                        break;
                }
            }

            if (changes) {
                // apply translate as negative values
                const tProp = "scale(" + curZoom + ") translate(" + (-curTranslateLeft) + "px," + (-curTranslateTop) + "px)";
                transformRoot.style[transformProp] = tProp;
                debuglog(tProp); // + "  maxScrollX=" + maxScrollX() + " maxScrollY=" + maxScrollY());
                propagated.curZoom = curZoom;
                propagated.curTranslateTop = curTranslateTop;
                propagated.curTranslateLeft = curTranslateLeft;
            }
            if (removeAndResetWillChangeHint > 0) {
                debuglog("FinalizeUserInteraction, hint after " + removeAndResetWillChangeHint);
                const time = removeAndResetWillChangeHint;
                removeAndResetWillChangeHint = 0;
                removeHint();
                setZoomCss();
                hintBrowserIfIdle(time);
            }
            propagateZoomAndPan();
        })
    }

}

/*
 * **** WILL-CHANGE-HINT CONTROL *****
 */

let browserWillChangeActive = false;
let hintTimeoutHandle = null;

function hintBrowserIfIdle(time = 500) {
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
        const wci = document.getElementById("willChangeIndicator");
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

        const wci = document.getElementById("willChangeIndicator");
        if (wci) {
            wci.style.visibility = "hidden";
        }
    }
}

//TODO: remove export
export function translateLeft(): number {
    return curTranslateLeft;
}
//TODO: remove export
export  function translateTop(): number {
    return curTranslateTop;
}

function appOffsetLeft(): number {
    return getElementOffset(app, "offsetLeft");
}

function appOffsetTop(): number {
    return getElementOffset(app, "offsetTop");
}

export function appWidth(): number {
    return getElementOffset(app, "offsetWidth");
}

export function appHeight(): number {
    return getElementOffset(app, "offsetHeight");
}


export function getContentWidth(): number {
    let cw = transformRoot.offsetWidth;
    if (!(cw > 0)) {
        if (transformRoot.style.width) {
            cw = parseInt(transformRoot.style.width.replace("px", ""));
        }
    }
    return cw;
}

export function getContentHeight(): number {
    let ch = transformRoot.offsetHeight;
    if (!(ch > 0)) {
        if (transformRoot.style.height) {
            ch = parseInt(transformRoot.style.height.replace("px", ""));
        }
    }
    return ch;
}

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


function setZoom(newZoom: number, animate: number, modelX: number, modelY: number, screenX = appWidth() / 2, screenY = appHeight() / 2, dontPersist: boolean = false) {

    let tL: number, tT: number;

    // debuglog("Set App-Div Zoom (model: " + modelX + "/" + modelY + ")  Zoom:" + newZoom);
    newZoom = Math.max(Math.min(newZoom, maxZoom), minZoom);


    let screenCenterOffSet = {
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

let transformProp = (function () {
    const testEl = document.createElement('div');
    if (testEl.style.transform == null) {
        const vendors = ['Webkit', 'Moz', 'ms'];
        for (let vendor in vendors) {
            if (testEl.style[vendors[vendor] + 'Transform'] !== undefined) {
                return vendors[vendor] + 'Transform';
            }
        }
    }
    return 'transform';
})();


function setZoomAndScroll(z: number, x: number, y: number, animateSeconds: number = 0, dontPersist: boolean = false) {

    curZoom = Math.max(Math.min(z, maxZoom), minZoom);
    curTranslateLeft = Math.max(-bleed, Math.min(maxScrollX(), x));
    curTranslateTop = Math.max(-bleed, Math.min(maxScrollY(), y));

    if (animateSeconds > 0) {
        transformRoot.style.transition = "transform " + animateSeconds + "s";
    } else {
        transformRoot.style.transition = "none";
    }

    // we propagate to browser in request animationframe loop


    //  setZoomCss();

    if (!dontPersist) {
        saveScrollPosition();
    }

    if (zoomChangedCallback) zoomChangedCallback(curZoom);
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

function getElementOffset(element, property) {

    if (property == "offsetLeft" || property == "offsetTop") {
        let actualOffset = element[property];
        let current = element.offsetParent;

        //Look up the node tree to add up all the offset value
        while (current != null) {
            actualOffset += current[property];
            current = current.offsetParent;
        }

        return actualOffset;
    } else if (property == "offsetHeight" || property == "offsetWidth") {
        return element[property];
    }

    return false;
}


function showScrollBar() {
    if (scrollBarTimeout) {
        clearTimeout(scrollBarTimeout);
    }
    scrollV.style.display = "block";
    scrollH.style.display = "block";
    const sH = contentHeight + 2 * bleed;
    const sW = contentWidth + 2 * bleed;
    const aH = appHeight();
    const aW = appWidth();


    let h = aH / (sH * curZoom) * aH;
    if (h < 50) h = 50;
    if (h > aH) h = aH;

    let t = Math.max(0, (curTranslateTop / maxScrollY()) * (aH - h));
    scrollV.style.top = (t + 2) + "px";
    scrollV.style.height = Math.min(aH - 19 - t, h) + "px";  //-12 prevents scrollbar from crossing


    let w = aW / (sW * curZoom) * aW;
    if (w < 50) w = 50;
    if (w > aW) w = aW;

    let l = Math.max(0, (curTranslateLeft / maxScrollX()) * (aW - w));
    scrollH.style.left = (l + 2) + "px";
    scrollH.style.width = Math.min(aW - 19 - l, w) + "px";

    scrollBarTimeout = setTimeout(function () {
        scrollV.style.display = "none";
        scrollH.style.display = "none";
        userInteractionCompleted();
    }, 500); // looks weird with mouse wheel otherwise
}

function onVerticalScrollAreaDown(ev: MouseEvent) {
    ev.preventDefault();
    const p = getMouseOrTouchEventPageXYInternal(ev);

    const sTop = getPixelNumber(scrollV.style.top);
    const sHeight = getPixelNumber(scrollV.style.height);
    let step =  (curZoom * contentHeight)  / (appHeight() / sHeight) ;
    step = step / curZoom * 0.85;
    if (p.pageY - appOffsetTop() < sTop) {
        setZoomAndScroll(curZoom, curTranslateLeft, curTranslateTop - step, 0.4);
    }
    else if (p.pageY - appOffsetTop() > sTop + sHeight) {
        setZoomAndScroll(curZoom, curTranslateLeft, curTranslateTop + step, 0.4);
    } else {
        // click on scroller

        app.style.cursor = "pointer";
        scrollBarDragActive = scrollBarDragE.vertical;
        captureFirstTouchOrMouseDown(ev);


    }
    showScrollBar();
}

function onHorizontalScrollAreaDown(ev: MouseEvent) {
    ev.preventDefault();
    const p = getMouseOrTouchEventPageXYInternal(ev);

    const sLeft = getPixelNumber(scrollH.style.left);
    const sWidth = getPixelNumber(scrollH.style.width);
    let step = (curZoom * contentWidth)  / (appWidth() / sWidth) ;
    step = step / curZoom * 0.85;
    if (p.pageX - appOffsetLeft() < sLeft) {
        setZoomAndScroll(curZoom, curTranslateLeft - step, curTranslateTop, 0.4);
    }
    else if (p.pageX - appOffsetLeft() > sLeft + sWidth) {
        setZoomAndScroll(curZoom, curTranslateLeft + step, curTranslateTop, 0.4);
    } else {
        // click on scroller

        scrollBarDragActive = scrollBarDragE.horizontal;
        app.style.cursor = "pointer";
        captureFirstTouchOrMouseDown(ev);


    }
    showScrollBar();
}

function getPixelNumber(x: string): number {
    if (x && typeof x === "string") {
        x = x.replace("px", "");
    }
    if (x) {
        return parseInt(x);
    } else {
        return 0;
    }
}

function saveScrollPosition() {
    let view: iView = {
        contextId: contextId,
        zoom: curZoom,
        modelX: curTranslateLeft,
        modelY: curTranslateTop
    };
    window.localStorage.setItem("view" + contextId, JSON.stringify(view));
}

export function recallZoomAndPan(scopeName: string =null, animationSeconds: number =0.0): boolean {
    if (scopeName) {
        contextId = scopeName;
    }

    let view: iView;
    let s = window.localStorage.getItem("view" + contextId);
    if (s) {
        view = JSON.parse(s);
        if (view && view.zoom > 0) {
            setZoomAndScroll(view.zoom, view.modelX, view.modelY, animationSeconds, true);
            userInteractionCompleted();
            return true;
        }
    }
    return false;
}


function setZoomCss() {
    /* Tell current zoom to to root item */

    if (curZoom < 0.5) {
        // transformRoot.setAttribute("data-draw", "block");

        // Values 0.4, 0.3 , 0.2 ,0.1 ,0.0
        //  transformRoot.setAttribute("data-zoom", "0." + Math.round(curZoom * 10));

    } else {
        //  transformRoot.setAttribute("data-zoom", "");
        // transformRoot.setAttribute("data-draw", "");
    }
}

function isTargetInputElement(target) {
    // check if text input is active
    if (target && (<HTMLElement>target).nodeName) {
        const elemName = target["nodeName"].toLowerCase();
        if (elemName === "textarea" || elemName === "input") {
            return true;
        }
    }
    return false;
}

function isTargetAllowed(target: any) {
    if (target) {
        return target.closest(".no-zoom") === null
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

let touchOrMousePanActive = false;
let scrollBarDragActive: scrollBarDragE = scrollBarDragE.none;
let twoFingerTouchActive = false;


let startTime: number = null;
let Timer50msMouseDownHandle = null;
let gestureStartZoom = 1;

function onGestureStart(ev: any) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    gestureStartZoom = curZoom;
    //debuglog("GestureStart " + e.scale);
    hintBrowser();
}

function onGestureChange(ev: any) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    debuglog("GestureChange " + ev.scale + " px=" + ev.pageX + " py=" + ev.pageY);
    setZoom(gestureStartZoom * ev.scale, 0, screenToModelX(ev.pageX), screenToModelY(ev.pageY), ev.pageX, ev.pageY, false);
}

function onGestureEnd(ev: any) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    removeHint();
    hintBrowserIfIdle();
    //debuglog("GestureStart " + e.scale);
}

function onTouchStartOrMouseDown(ev: Event) {

    // stop animation if running
    panAnimationRunning = false;

    mouse.initialMovement = 0;

    debuglog("zoomstage onTouchStartOrMouseDown: pageX=" + (<MouseEvent>ev).pageX + "  pageY=" + (<MouseEvent>ev).pageY);

    if (!wasTouchEvent(ev) && mouseInScrollBarArea((<MouseEvent>ev).pageX, (<MouseEvent>ev).pageY)) {
        // mouse over scroll bar, skip mouse/touch handling


        // check of scrollbar hit
        /* if (ev.target === scrollH) {
             scrollBarDragActive = scrollBarDragE.horizontal;
             app.style.cursor = "pointer";
             captureFirstTouchOrMouseDown(ev);
         } else if (ev.target === scrollV) {
             scrollBarDragActive = scrollBarDragE.vertical;
             captureFirstTouchOrMouseDown(ev);
         }*/

        // second finger (or more, but we only look on finger 1+2)
        // we look always for it, to execute pinch-zoom
    } else if (touchCount > 0 && wasTouchEvent(ev) && (<TouchEvent>ev).touches.length > 1) {
        hideSingleTouchOverlay();
        hintBrowser();
        // *** second finger coming ***

        ev.preventDefault();

        // we might not have control on single touch, so we take over only for second touch and give back immedieatly
        twoFingerTouchActive = true;

        touchCount = (<TouchEvent>ev).touches.length;
        debuglog("TOUCH-COUNT=" + touchCount);
        // capture second tocuh start
        let p1 = getMouseOrTouchEventPageXYInternal(ev);
        let p2 = getMouseOrTouchEventPageXYInternal(ev, true);
        mouse.startZoom = curZoom;
        mouse.newZoom = 0;
        mouse.startDistance = distance(p1.pageX, p1.pageY, p2.pageX, p2.pageY);

        mouse.startScreenCenterX = p1.pageX + (p2.pageX - p1.pageX);
        mouse.startScreenCenterY = p1.pageY + (p2.pageY - p1.pageY);

        mouse.startModelCenterX = screenToModelX(mouse.startScreenCenterX);
        mouse.startModelCenterY = screenToModelY(mouse.startScreenCenterY);

    } else if (isTargetAllowed(ev.target)) {


        if (wasTouchEvent(ev) && (<TouchEvent>ev).touches.length === 1) {
            // no single finger pan for touch if user wants it.
            // show message instead

            if (surpressSingleTouchPan) {
                showSingleTouchOverlay();
            } else {
                touchOrMousePanActive = true;
                ev.preventDefault();
            }
        } else {
            touchOrMousePanActive = true;
            ev.preventDefault();
        }

        transformRoot.style.cursor = "move";    // only visible in mouse mode

        if (wasTouchEvent(ev)) {
            hintBrowser();
            touchCount = (<TouchEvent>ev).touches.length;
            debuglog("TOUCH-COUNT=" + touchCount);
        }

        captureFirstTouchOrMouseDown(ev);

        if (mouseDownCallback) mouseDownCallback(ev); // for deselect!!

    } else {

        // target not allowed (no-zoom), but if finger or mouse moves fast enough the users intention is to pan
        // so we will check the speed of mousemovement and take control if its more then 3px in the first 50ms

        if (isTargetInputElement(ev.target)) {
            return;
        }

        let timeOut = wasTouchEvent(ev) ? 50 : 10; // mouse has to move quicker than finger to override select behaviour

        if (wasTouchEvent(ev) && (<TouchEvent>ev).touches.length === 1 && surpressSingleTouchPan) {
            // no timer magic in this case, we are not allowed to handle a single touch anyhow
            showSingleTouchOverlay();

        } else if (wasTouchEvent(ev) || hasMousePanOnNoZoomItems) {
            // prevent text selection never actually wanted in this scenarios
            ev.preventDefault();

            if (timeOut) {
                Timer50msMouseDownHandle = setTimeout(function () {
                    //wait 50ms to check if user intention was pan
                    Timer50msMouseDownHandle = null;

                    debuglog("initialMovement(" + timeOut + "ms)=" + mouse.initialMovement);

                    if (mouse.initialMovement > 3) {
                        debuglog("Mouse moved in first " + timeOut + "ms " + (Date.now() - startTime));
                        // we take control
                        touchOrMousePanActive = true;
                        transformRoot.style.cursor = "move";    // only visible in mouse mode
                    } else {
                        // cancel pan, give control back to app
                        debuglog("Mouse NOT moved in first " + timeOut + "ms " + (Date.now() - startTime));
                        touchOrMousePanActive = false;

                        // We possible call a delayed mouse down but the finger or mouse is not down anymore.
                        if (mouseDownCallback) mouseDownCallback(ev)
                    }
                }, timeOut);
            }
        } else {

            // cancel pan, give control back to app
            debuglog("Mouse NOT moved in first " + timeOut + "ms " + (Date.now() - startTime));
            touchOrMousePanActive = false;

            // We possible call a delayed mouse down but the finger or mouse is not down anymore.
            if (mouseDownCallback) mouseDownCallback(ev)
        }


        if ((<HTMLElement>ev.target).classList.contains("selected")) {
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
            touchCount = (<TouchEvent>ev).touches.length;
        }

    }
}

function captureFirstTouchOrMouseDown(ev: Event) {

    let p = getMouseOrTouchEventPageXYInternal(ev); // mouseOnScaledMap(ev);#

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

function onMousemove(ev: MouseEvent) {


    // pre capture move delta to determine if we take control after 50ms
    mouse.initialMovement = Math.abs(mouse.startScreenX - ev.pageX) + Math.abs(mouse.startScreenY - ev.pageY);

    edgeScrollDirection = edgeScrollDirectionE.none; // safety first

    /* const ms = (Date.now() - startTime);

     if (ms <= 50) {
         debuglog("Mouse moved after " + ms + "ms   X=" + (mouse.startScreenX - ev.pageX) + "   Y=" + (mouse.startScreenY - ev.pageY));
     } */


    if (touchOrMousePanActive) {

        //debuglog("ev.buttons === "+ ev.buttons + " transformRoot.style.cursor === "+  transformRoot.style.cursor);

        if (ev.buttons === 1 && transformRoot.style.cursor === "move") {

            //if (ev.target && isTargetAllowed(ev.target)) {
            //mousePanScroll(mouseOnScaledMap(ev), 0);
            // pass just the scaled mouse on screen
            mousePanScroll(getMouseOrTouchEventPageXYInternal(ev), 0);
            showScrollBar();
            //}
        }
    } else if (ev.buttons === 1) {
        if (scrollBarDragActive === scrollBarDragE.horizontal) {

            ev.preventDefault();
            const cW = contentWidth + 2 * bleed;
            const factor = (cW * curZoom) / appWidth();
            // console.log(" mouse.startModelXOffset = "+  mouse.startModelXOffset + " ev.pageX=" +ev.pageX+ " mouse.startScreenX="+ mouse.startScreenX + "    curZoom=" + curZoom + "   (ev.pageX- mouse.startScreenX) / curZoom = " + (ev.pageX- mouse.startScreenX) / curZoom )
            setZoomAndScroll(curZoom, mouse.startModelXOffset + ((ev.pageX - mouse.startScreenX) / curZoom * factor), curTranslateTop, 0);
            showScrollBar();

        } else if (scrollBarDragActive === scrollBarDragE.vertical) {

            ev.preventDefault();
            const cH = contentHeight + 2 * bleed;
            const factor = (cH * curZoom) / appHeight();
            setZoomAndScroll(curZoom, curTranslateLeft, mouse.startModelYOffset + ((ev.pageY - mouse.startScreenY) / curZoom * factor), 0);
            showScrollBar();

        } else {
            // propably a user drag and drop
            setEdgeScrollDirection(ev.pageX, ev.pageY);
        }

    } else if (mouseInScrollBarArea(ev.pageX, ev.pageY)) {
        // check if mouse is in scrollbar area
        showScrollBar();
    }
}

let pinch: iPageXY = {
    pageX: 0,
    pageY: 0
};

let lastDistance = 0;

function onTouchmove(ev: TouchEvent) {
    // the only way to turn off native scaling in chrome / Safari / iOS10+
    // evebt must be registered as not passive

    if (ev.touches.length === 1) {
        mouse.initialMovement = Math.abs(mouse.startScreenX - ev.touches[0].pageX) + Math.abs(mouse.startScreenY - ev.touches[0].pageY);
    }

    if (touchOrMousePanActive || twoFingerTouchActive) {


        ev.preventDefault();
        edgeScrollDirection = edgeScrollDirectionE.none; // safety first
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
            let p1 = getMouseOrTouchEventPageXYInternal(ev);

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

            let dist = distance(p1.pageX, p1.pageY, pinch.pageX, pinch.pageY);

            if (lastDistance && ev.ctrlKey) {
                dist = lastDistance;
            } else {
                lastDistance = dist;
            }

            let newZoom = mouse.shiftStartZoom * (dist / mouse.shiftStartDistance);
            debuglog("shiftStartZoom=" + mouse.shiftStartZoom + " calc zoom=" + (dist / mouse.shiftStartDistance));
            debuglog("PINCH-Distance:" + mouse.shiftStartDistance + "/" + dist + " z=" + newZoom);

            // same calculation then in "mousePanScroll"
            let center: iPageXY = {
                pageX: p1.pageX + (pinch.pageX - p1.pageX),
                pageY: p1.pageY + (pinch.pageY - p1.pageY)
            };

            mouse.deltaScreenX = mouse.startScreenCenterX - center.pageX;
            mouse.deltaScreenY = mouse.startScreenCenterY - center.pageY;

            // set zoom and pan, add pan offset to model coordinates

            setZoom(newZoom, 0,
                mouse.startModelCenterX + mouse.deltaScreenX / curZoom,
                mouse.startModelCenterY + mouse.deltaScreenY / curZoom,
                mouse.startScreenCenterX,
                mouse.startScreenCenterY);

        } else if (ev.touches.length >= 2 && mouse.startDistance > 0 && twoFingerTouchActive) {

            /*
             **** PINCH ZOOMING ***
             */

            let p1 = getMouseOrTouchEventPageXYInternal(ev);
            let p2 = getMouseOrTouchEventPageXYInternal(ev, true);

            // mouse start zoom for distance
            let dist = distance(p1.pageX, p1.pageY, p2.pageX, p2.pageY);
            mouse.newZoom = mouse.startZoom * (dist / mouse.startDistance);

            // take center of both touches for zoom center / pan offset
            let center: iPageXY = {
                pageX: p1.pageX + (p2.pageX - p1.pageX),
                pageY: p1.pageY + (p2.pageY - p1.pageY)
            };

            // same calculation then in "mousePanScroll"
            mouse.deltaScreenX = mouse.startScreenCenterX - center.pageX;
            mouse.deltaScreenY = mouse.startScreenCenterY - center.pageY;

            // set zoom and pan, add pan offset to model coordinates
            setZoom(mouse.newZoom, 0,
                mouse.startModelCenterX + mouse.deltaScreenX / curZoom,
                mouse.startModelCenterY + mouse.deltaScreenY / curZoom,
                mouse.startScreenCenterX,
                mouse.startScreenCenterY);


        } else if (ev.touches.length > 0) {
            // if we did not enter pan mode initially, we should not continue now
            if (touchOrMousePanActive) {
                //   if (ev.target && isTargetAllowed(ev.target)) {
                mousePanScroll(getMouseOrTouchEventPageXYInternal(ev), ev.touches.length);
                //  }
            } else if (ev.touches.length === 1) {
                // propably a user drag and drop
                setEdgeScrollDirection(ev.touches[0].pageX, ev.touches[0].pageY)
            }
        }
    }
}

function setEdgeScrollDirection(x: number, y: number) {
    if (edgeScroll) {
        // are we add the edges?
        // only do once per request animation frame
        if (x >= appOffsetLeft() && x < appOffsetLeft() + edgeScrollZonePixel) {
            edgeScrollDirection = edgeScrollDirectionE.left;
        } else if (x > appOffsetLeft() + appWidth() - edgeScrollZonePixel && x <= appOffsetLeft() + appWidth()) {
            edgeScrollDirection = edgeScrollDirectionE.right;
        } else if (y >= appOffsetTop() && y < appOffsetTop() + edgeScrollZonePixel) {
            edgeScrollDirection = edgeScrollDirectionE.up;
        } else if (y > appOffsetTop() + appHeight() - edgeScrollZonePixel && y <= appOffsetTop() + appHeight()) {
            edgeScrollDirection = edgeScrollDirectionE.down;
        } else {
            edgeScrollDirection = edgeScrollDirectionE.none;
        }
    } else {
        edgeScrollDirection = edgeScrollDirectionE.none;
    }
    if (edgeScrollDirection !== edgeScrollDirectionE.none) {
        showScrollBar();
    }

    //console.log("EDGE=" + edgeScrollDirection);
}

function mouseInScrollBarArea(x: number, y: number) {


    if (x > appOffsetLeft() + appWidth() - 20 && x <= appOffsetLeft() + appWidth()) {
        return true;
    } else if (y > appOffsetTop() + appHeight() - 20 && y <= appOffsetTop() + appHeight()) {

        return true;
    } else {
        // nothing
        return false;
    }

}

function onMouseup(ev: MouseEvent) {

    if (Timer50msMouseDownHandle) {
        clearTimeout(Timer50msMouseDownHandle)
    }

    if (isTargetInputElement(ev.target)) {
        return;
    }

    if (scrollBarDragActive !== scrollBarDragE.none) {
        scrollBarDragActive = scrollBarDragE.none;
    } else {
        callMouseUpCallBack(ev);
    }


    if (touchOrMousePanActive) {
        transformRoot.style.cursor = "auto";
        touchOrMousePanActive = false;


    }
}

function callMouseUpCallBack(ev: any) {
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
        } else {
            mouseUpCallback(ev);
        }

    }
}

function onTouchend(ev: TouchEvent) {

    // debuglog("ON-TOUCH-END touchOrMousePanActive="+ touchOrMousePanActive);

    if (surpressSingleTouchPan) {
        if (ev.touches.length !== 1) {
            hideSingleTouchOverlay();
        } else {
            showSingleTouchOverlay();
        }
    }

    if (Timer50msMouseDownHandle) {
        clearTimeout(Timer50msMouseDownHandle)
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
        } else {

            callMouseUpCallBack(ev);
            touchOrMousePanActive = false;
            mouse.lastDeltaScreenY = 0;
            mouse.lastDeltaScreenX = 0;
            startPanEasing();
        }

        touchCount = ev.touches.length;
        debuglog("TOUCH-COUNT=" + touchCount);
        mouse.startDistance = 0;

    } else {
        if (ev.touches.length === 0 && mouse.newZoom === 0) {
            callMouseUpCallBack(ev);
        }
    }

}


function distance(x1: number, y1: number, x2: number, y2: number) {
    let diffX = x2 - x1;
    let diffY = y2 - y1;

    return Math.sqrt(diffX * diffX + diffY * diffY);

}


// ******************************


/*
 *    *** PAN ANIMATION ***
 */

function startPanEasing() {
    let i: number, j: number;
    let panSpeed: iVector2D = {x: 0, y: 0};
    let panVelocity: number = 0, dist: number = 0;
    let ms = Date.now();
    let velocityCapture: iCapture = null;
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
        if (i < 0) i = 9;
        if (velocityCaptures[i].ms > 0) {
            let msDiff = ms - velocityCaptures[i].ms;
            if (msDiff > 20) {
                // this happend aprox. 20-50ms ago
                debuglog("CATCH Velocity Time Diff:" + msDiff + "ms + Dist=" + Math.sqrt(Math.pow(velocityCaptures[i].sX, 2) + Math.pow(velocityCaptures[i].sY, 2)));
                velocityCapture = velocityCaptures[i];
                break;
            } else {
                debuglog("SKIPPED Velocity Time Diff:" + msDiff + "ms");
            }
        }

    }

    // calculate speed
    if (velocityCapture && (velocityCapture.sX || velocityCapture.sY)) {
        let elapsed = ms - velocityCapture.ms;
        let delta: iVector2D = {
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
                requestAnimationFrame(panEasing)
            } else {
                debuglog("Pan animation canceld, to less movement");
            }
        }
    }


    // reset velocity ringbuffer
    for (let j = 0; j < 10; j++) {
        velocityCaptures[j].ms = 0;
    }
    if (!panAnimationRunning) {
        finalizePanEasing()
    }
}


function panEasing() {
    let elapsedMs = Date.now() - easing.startMs;

    if (panAnimationRunning && elapsedMs <= easing.duration) {
        // time position (0-1)
        let t = (elapsedMs / easing.duration);
        t = easingFunction(t);
        let sX = easing.startX + (easing.offX / curZoom * t);
        let sY = easing.startY + (easing.offY / curZoom * t);

        setZoomAndScroll(curZoom, sX, sY, 0, true);

    } else {

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

function easingFunction(t: number): number {
    return t * (2 - t)
}


/*
 ***** MOUSE CONTROL DISPLAYS *****
 */


function mousePanScroll(p: iPageXY, touches: number, zoom = curZoom) {

    mouse.deltaScreenX = mouse.startScreenX - p.pageX;
    mouse.deltaScreenY = mouse.startScreenY - p.pageY;

    // set left/top point of stage
    let sX = mouse.startModelXOffset + (mouse.deltaScreenX / curZoom);
    let sY = mouse.startModelYOffset + (mouse.deltaScreenY / curZoom);

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
        if (velocityCaptureIndex === 10) velocityCaptureIndex = 0;
        //         debuglog("velocityCaptureIndex: " + velocityCaptureIndex);
    } else {
        // invalidate buffer
        velocityCaptureIndex = 0;
        for (let i = 0; i < 10; i++) {
            velocityCaptures[i].ms = 0;
        }
    }

    setZoomAndScroll(zoom, sX, sY, 0);

}


function onWheel(ev: WheelEvent) {
    ev.preventDefault();

    let newZoom = curZoom;
    let modelX = screenToModelX(ev.pageX);
    let modelY = screenToModelY(ev.pageY);

    if (isTouchPad && !ev.ctrlKey) {
        //https://stackblitz.com/edit/multi-touch-trackpad-gesture

        modelX += ev.deltaX * 1.5 / curZoom;
        modelY += ev.deltaY * 1.5 / curZoom;

    } else {
        // Just mouse-wheel zoom, no pan;

        let ms = new Date().getMilliseconds() - lastWheelEvent;

        let faktor = (Math.max(Math.min(30, ms), 10) - 10); // 0-20
        faktor /= 20;
        faktor *= 0.11; // was 0.09;
        faktor += 1.01;

        lastWheelEvent = new Date().getMilliseconds();

        // delta is extrem device spezifisch und komplett unbrauchbar
        if (ev.deltaY >= 0) {
            newZoom = curZoom / faktor;
        } else {
            newZoom = curZoom * faktor;
        }
    }

    // hintBrowser(); //creates artefacts on safari and chrome
    setZoom(newZoom, 0, modelX, modelY, ev.pageX, ev.pageY, false);
    showScrollBar();
}
