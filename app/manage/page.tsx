"use client";

import firebase, {genUID} from "@/app/util/firebase/init";
import {getAuth} from "@firebase/auth";
import React, {useContext, useEffect, useRef, useState} from "react";
import SignInPage from "@/app/manage/SignInPage";
import FirebaseContext from "@/app/util/firebase/FirebaseContext";
import Dropdown from "@/app/util/Dropdown";
import {RiDraggable} from "react-icons/ri";
import {FiCheck, FiEdit2, FiPlus, FiTrash2, FiX} from "react-icons/fi";
import {
    getNumFCM,
    removePerformer,
    renamePerformer, sendNotification,
    setCurrentPerformer,
    updateClients,
    updatePerformers
} from "@/app/manage/FCMManager";
import AddPerformerPopup from "@/app/manage/AddPerformerPopup";
import SetCurrentPerformer from "@/app/manage/SetCurrentPerformer";
import scrollIntoView from "scroll-into-view-if-needed";
import Loading from "@/app/util/Loading";
import Popup from "@/app/util/Popup";
import {getColorScheme} from "@/app/util/util";
import Image from "next/image";

export default function ManagePerformers() {
    const data = useContext(FirebaseContext);

    const [firebaseLoading, setFirebaseLoading] = useState(false);

    useEffect(() => {
        // the user did something, therefore update clients with new data
        if (firebaseLoading) {
            let current = data[stage].currentPerformer;
            let performers = data[stage].performers;

            updateFirebase(jwt => updateClients(jwt, stage, performers[current], performers[current+1]), false);
        }

        setFirebaseLoading(false);
    }, [data]);

    const updateFirebase = (func: (jwt: string)=>Promise<void>, fromUser: boolean = true) => {
        if(fromUser) setFirebaseLoading(true);

        getAuth(firebase).currentUser?.getIdToken().then(func);
    }

    const [loggedIn, setLoggedIn] = useState(getAuth(firebase).currentUser !== null);
    const [selectedStage, setStage] = useState(0);
    const stage = Object.keys(data)[selectedStage];

    const [editingName, setEditingName] = useState(-1);
    const [origName, setOrigName] = useState("");
    useEffect(() => {
        const name = document.getElementById("name"+editingName);
        if (!name) return;

        setOrigName(name.textContent ?? "");

        const range = document.createRange();
        range.setStart(name, 0);

        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    }, [editingName]);

    const [removingPerformer, setRemovingPerformer] = useState(-1);

    const confirm = (value: boolean) => {
        if (editingName !== -1) {
            const name = document.getElementById("name"+editingName);

            if (name) {
                if (value) {
                    updateFirebase(jwt => renamePerformer(jwt, stage, editingName, name.textContent!));
                } else {
                    name.textContent = origName;
                }
            }

            setEditingName(-1);
        } else if (removingPerformer !== -1) {
            if (value) {
                updateFirebase(jwt => removePerformer(jwt, stage, data[stage].performers, removingPerformer));
            }

            setRemovingPerformer(-1);
        }
    };

    const [addingPerformer, setAddingPerformer] = useState(-1);

    const [dragging, setDragging] = useState(-1);
    const performersContainer = useRef<HTMLDivElement>(null);
    const svgOffset = useRef({x: 0, y: 0});
    const performerPositions = useRef<number[]>([]);
    const currentChips = useRef<(HTMLElement|null)[]>([]);

    const scrollBy = useRef(0);

    // TODO: error when dragging last performer?
    // TODO: 2-line artist string extends div
    // TODO: stage selector
    // TODO: send notif popup
    // TODO: edit performer popup
    // TODO: change current performer popup

    const movePerformer = (parent: HTMLElement, idx: number, direction: 1 | -1) => {
        let pos = performerPositions.current[idx]
        let idx2 = performerPositions.current.indexOf(pos + direction);

        const marker = document.createElement("div");
        const child1 = parent.childNodes[pos * 2];
        const child2 = parent.childNodes[(pos + direction) * 2];

        parent.insertBefore(marker, child1);
        parent.insertBefore(child1, child2);
        parent.insertBefore(child2, marker);
        parent.removeChild(marker);

        performerPositions.current[idx] += direction;
        performerPositions.current[idx2] -= direction;

        for (let i = 0; i < currentChips.current.length; i++) {
            currentChips.current[i]?.classList.toggle("invisible", performerPositions.current[i] != data[stage].currentPerformer);
        }
    }

    const startDrag = (idx: number, touchEvt?: React.TouchEvent<HTMLDivElement>, mouseEvt?: React.MouseEvent<HTMLDivElement>) => {
        navigator.vibrate && navigator.vibrate(100);

        let row = ((touchEvt || mouseEvt)!.target as HTMLElement);
        while (!row.classList.contains('row')) row = row.parentElement!;

        let pos = touchEvt ? touchEvt.touches[0] : mouseEvt!;

        performerPositions.current = data[stage].performers.map((_, i)=>i);
        svgOffset.current = {x: pos.clientX - row.offsetLeft, y: pos.clientY - row.offsetTop + performersContainer.current!.scrollTop};
    }

    const checkRowMove = (row: HTMLElement, idx: number) => {
        const currentIdx = performerPositions.current[idx];
        const scroll = performersContainer.current!.scrollTop;

        if (currentIdx > 0 && row.offsetTop + row.offsetHeight + scroll < row.parentElement!.offsetTop) {
            movePerformer(performersContainer.current!, idx, -1);
        } else if (currentIdx < data[stage].performers.length && row.offsetTop + scroll > row.parentElement!.offsetTop + row.parentElement!.offsetHeight) {
            movePerformer(performersContainer.current!, idx, 1);
        }
    }
    const drag = (idx: number, touchEvt?: React.TouchEvent<HTMLDivElement>, mouseEvt?: React.MouseEvent<HTMLDivElement>) => {
        if (dragging === -1) setDragging(idx);

        let row = ((touchEvt || mouseEvt)!.target as HTMLElement);
        while (!row.classList.contains('row')) row = row.parentElement!;

        let mousePosContainer = touchEvt ? touchEvt.touches[0] : mouseEvt!;

        let containerTop = performersContainer.current!.offsetTop;
        let containerBottom = containerTop + performersContainer.current!.offsetHeight;

        const setScroll = (scroll: number) => {
            if (scrollBy.current === scroll) return;
            scrollBy.current = scroll;

            if (scroll != 0) {
                (async () => {
                    const container = performersContainer.current!;
                    while (scrollBy.current != 0) {
                        container.scrollBy({top:scrollBy.current, behavior: "instant"});
                        checkRowMove(row, idx);

                        await new Promise(r => setTimeout(r, 1));
                    }
                })();
            }
        }

        let top = Math.max(containerTop, Math.min(containerBottom - row.offsetHeight, mousePosContainer.clientY - svgOffset.current.y));
        row.style.top = top+'px';

        let bottom = top + row.offsetHeight;
        if (containerBottom-bottom < 10) {
            setScroll(1);
        } else if (top-containerTop < 10) {
            setScroll(-1);
        } else {
            setScroll(0);
        }

        checkRowMove(row, idx);
    }
    const stopDrag = (evt: React.UIEvent) => {

        let row = (evt.target as HTMLElement);
        while (!row.classList.contains('row')) row = row.parentElement!;

        if (performerPositions.current.length) {
            const performers = performerPositions.current
                .reduce((arr, performer, idx) => {arr[performer] = idx; return arr;}, [] as number[]) // invert
                .map(i => data[stage].performers[i]);
            updateFirebase(jwt => updatePerformers(jwt, stage, performers));
            setDragging(-1);
        }

        scrollBy.current = 0;
        row.style.left = row.style.top = row.style.width = '';
        performerPositions.current = [];
        svgOffset.current = {x: 0, y: 0};
    }

    const scroll = (ifNeeded: boolean) => {
        let child;
        if (!(child=performersContainer.current?.childNodes[data[stage].currentPerformer*2])) return;

        scrollIntoView(child as Element, {
            behavior: 'smooth',
            scrollMode: ifNeeded ? 'if-needed' : 'always'
        })
    }

    // scroll to current performer if necessary when data changes
    useEffect(() => scroll(true), [data]);
    useEffect(() => scroll(false), [stage]);
    useEffect(() => scroll(false), []);

    const genDivider = (i: number) => {
        return <div className={"w-full flex" + (i == -1 ? " mt-2" : "")} key={"s"+i}>
            <div className={"bg-neutral-400 inline-block w-1/3 h-px m-auto"} />
            <button className={"bg-blue-300 inline-block text-blue-100 rounded-lg p-1"}
                    onClick={() => setAddingPerformer(i+1)}><FiPlus /></button>
            <div className={"bg-neutral-400 inline-block w-1/3 h-px m-auto"} />
        </div>
    }

    const color = getColorScheme(selectedStage)

    const [notifPopup, setNotifPopup] = useState(false);
    const [notifConfirm, setNotifConfirm] = useState(false);
    const notifTitle = useRef<HTMLInputElement>(null);
    const notifBody = useRef<HTMLInputElement>(null);

    const currentPerformer = data[stage].performers[data[stage].currentPerformer];

    return !loggedIn ? <SignInPage logIn={()=>setLoggedIn(true)} /> : (
        <div className={"bg-white flex w-full h-full flex-col"}>
            <div className={"flex justify-between flex-shrink-0 px-3 py-2"}>
                <p className={"text-sm my-auto text-gray-800 font-semiheavy mx-0"}>Manager Hub</p>
                <button className={"bg-gray-100 rounded-2xl text-xs text-gray-400 px-3 py-1"} onClick={()=>setLoggedIn(false)}>Log Out</button>
            </div>

            <Popup title={"Send Notification"} open={notifPopup} colorScheme={color}
                   close={(cancelled: boolean) => {
                       setNotifPopup(false);
                       !cancelled && setNotifConfirm(true);
                   }}>
                <div className={"mx-5 mt-3 flex flex-col"}>
                    <p className={"text-sm text-left"}>Notification Title</p>
                    <input ref={notifTitle} className={"border text-xs border-gray-200 rounded-md py-2 px-3"} />
                </div>
                <div className={"mx-5 mt-3 flex flex-col"}>
                    <p className={"text-sm text-left"}>Notification Body</p>
                    <input ref={notifBody} className={"border text-xs border-gray-200 rounded-md py-2 px-3"} />
                </div>
            </Popup>
            <Popup title={"Confirm Notification"} open={notifConfirm} colorScheme={color}
                   close={(cancelled: boolean) => {
                       !cancelled && updateFirebase(jwt =>
                           sendNotification(jwt, notifTitle.current!.value, notifBody.current!.value));
                       setNotifConfirm(false);
                   }}>
                {/* TODO: fix this, and probably make all client-side FCM a server function to make it more secure */}
                <p className={"mx-6 mb-5"}>Are you sure you want to notify <b>{0}</b> people?</p>
                <div className={"mx-5 h-16 rounded-xl border border-gray-400 flex"}>
                    <div className={"p-2 flex-shrink-0"}>
                        <img src={'/images/logo.svg'} alt={'Logo'} className={"h-full w-auto rounded-lg"} />
                    </div>
                    <div className={"mt-1.5 text-left overflow-hidden"}>
                        <p className={"font-semiheavy text-sm line-clamp-1 text-ellipsis"}>{notifTitle.current?.value}</p>
                        <p className={"text-xs line-clamp-2 text-ellipsis"}>{notifBody.current?.value}</p>
                    </div>
                </div>
            </Popup>

            <div className={`${color.bgLight} flex flex-col flex-shrink-0`}>
                <button className={`rounded-2xl text-xs mr-4 mt-2 px-2.5 py-1 ml-auto ${color.bgDark} ${color.textLight}`}
                    onClick={() => setNotifPopup(true)}>Send Notification</button>
                <div className={"ml-5 w-3/5"}>
                    <p className={"text-xs mt-2 text-left font-semiheavy text-gray-400"}>Currently Performing</p>
                    <p className={"text-2xl mt-1 text-gray-800 font-semiheavy text-left"}>{currentPerformer.name}</p>
                    <p className={"text-xs mt-3 text-gray-400 font-semiheavy line-clamp-2 overflow-hidden text-ellipsis text-left"}>{currentPerformer.artists ? `Performed by ${currentPerformer.artists.join(", ")}` : ' '}</p>
                </div>
                <div className={"mx-3 mt-6 mb-4 flex text-xs justify-evenly"}>
                    <button className={`px-6 py-2 rounded-lg ${color.bg} ${color.textLight}`}
                        onClick={() => updateFirebase(jwt => setCurrentPerformer(jwt, stage, data[stage].currentPerformer+1))}>Next Performer</button>
                    <button className={`px-4 py-2 rounded-lg ${color.border} ${color.text}`}
                            onClick={() => updateFirebase(jwt => setCurrentPerformer(jwt, stage, data[stage].currentPerformer-1))}>Previous</button>
                    <button className={`px-4 py-2 rounded-lg ${color.border} ${color.text}`}
                            onClick={/*TODO*/undefined}>Change</button>
                </div>
            </div>

            <div ref={performersContainer} className={"flex-grow select-none overflow-y-scroll"+(dragging == -1 ? "" : " touch-none")}>
                {([] as any[]).concat(...data[stage].performers.map((p,i) => [
                    <div key={"performer"+p.name} >
                        {i == dragging && <div><p>&nbsp;</p><p className={"text-xs py-2"}>&nbsp;</p></div>}
                        <div className={"row px-6 py-2 flex"+(i == dragging ? " fixed rounded-s shadow-2xl w-full bg-white" : "")}>
                            <div className={"flex flex-col text-left flex-grow overflow-hidden whitespace-nowrap"}>
                                <p className={"text-gray-800 font-semiheavy"}>{p.name}</p>
                                <p className={"text-gray-600 text-xs text-ellipsis overflow-hidden"}>{p.artists ? p.artists.join(',') : " "}</p>
                            </div>
                            <p ref={el => currentChips.current[i] = el} className={`${color.bg} ${color.textLight} my-auto text-xs px-2 h-fit py-0.5 mr-1.5 rounded-sm font-semiheavy ${i != data[stage].currentPerformer && 'invisible'}`}>Current</p>
                            <button className={"bg-gray-100 text-gray-700 h-fit my-auto py-0.5 px-2 rounded-sm mr-1.5 font-semiheavy text-xs"}
                                    onClick={/*TODO*/undefined}>Edit</button>
                            <div className={"text-gray-400 py-0.5 touch-none rounded-xs text-sm flex-shrink-0 bg-gray-200 my-auto"}
                                 onTouchMove={(evt) => drag(i, evt)}
                                 onMouseMove={(evt) => drag(i, undefined, evt)}
                                 onTouchStart={(evt) => startDrag(i, evt)}
                                 onMouseDown={(evt) => startDrag(i, undefined, evt)}
                                 onTouchEnd={stopDrag}
                                 onMouseUp={stopDrag}>
                                <RiDraggable />
                            </div>
                        </div>
                    </div>,
                    <div key={"spacer"+i} className={"w-full h-px bg-gray-200"} />
                ])).slice(0, -1)}
            </div>
        </div>
    )
}