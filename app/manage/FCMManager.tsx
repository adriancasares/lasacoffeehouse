"use server";

import {applicationDefault, initializeApp, getApp, getApps} from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import {getDatabase} from "firebase-admin/database";
import {getAuth} from "firebase-admin/auth";
import {AES, enc} from "crypto-js";

const firebase = getApps().find(a => a.name == "Admin App") ??
    initializeApp({
        credential: JSON.parse(enc.Utf8.stringify(AES.decrypt(process.env.FIREBASE_ADMIN_DATA!, enc.Utf8.parse(process.env.FIREBASE_ADMIN_CRED!.slice(16)), {iv: enc.Utf8.parse(process.env.FIREBASE_ADMIN_CRED!.slice(0, 16))}))),
        databaseURL: "https://lasacoffeehouse-74e2e-default-rtdb.firebaseio.com/"
    }, "Admin App")

export default async function updateClients(jwt: string, stage: string, current: string, next: string) {
    // TODO: some sort of logging on failure?
    try {
        await getAuth(firebase).verifyIdToken(jwt, true);
    } catch { return; }

    const database = getDatabase(firebase);
    const messaging = getMessaging(firebase);

    const fcm = (await database.ref("/fcm").get()).val();

    for (let token in fcm) {
        let timestamp = parseInt(fcm[token]) || 0;

        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
            database.ref(`/fcm/${token}`).remove().then();
            continue;
        }

        messaging.send({
            token,
            data: {stage, current, next}
        }).catch(() => {});
    }
}