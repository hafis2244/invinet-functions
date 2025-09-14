const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

const packages = {
    vip1: { price: 250000, profit: 120000, duration: 7 },
    vip2: { price: 500000, profit: 240000, duration: 7 },
    vip3: { price: 1500000, profit: 500000, duration: 7 },
    vip4: { price: 3000000, profit: 900000, duration: 7 },
};

exports.buyPackage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Anda harus login.");
    }
    
    const userId = context.auth.uid;
    const packageId = data.packageId;
    const selectedPackage = packages[packageId];

    if (!selectedPackage) {
        throw new functions.https.HttpsError("not-found", "Paket tidak ditemukan.");
    }

    const userRef = db.doc(`users/${userId}`);

    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new functions.https.HttpsError("not-found", "User tidak ditemukan.");
        }

        const userData = userDoc.data();

        if (userData.activePackage) {
            throw new functions.https.HttpsError("failed-precondition", "Anda sudah memiliki paket aktif.");
        }
        if (userData.balance < selectedPackage.price) {
            throw new functions.https.HttpsError("failed-precondition", "Saldo Anda tidak mencukupi.");
        }

        const newBalance = userData.balance - selectedPackage.price;
        const currentTime = new Date();
        const endTime = new Date(currentTime.getTime() + (selectedPackage.duration * 24 * 60 * 60 * 1000));

        const newActivePackage = {
            name: packageId.toUpperCase(),
            price: selectedPackage.price,
            profit: selectedPackage.profit,
            duration: selectedPackage.duration,
            endTime: admin.firestore.Timestamp.fromDate(endTime),
            lastProfitDisbursementTime: admin.firestore.Timestamp.fromDate(currentTime),
            earnedCycles: 0,
        };

        transaction.update(userRef, {
            balance: newBalance,
            activePackage: newActivePackage,
        });

        const txRef = userRef.collection("transactions").doc();
        transaction.set(txRef, {
            date: admin.firestore.FieldValue.serverTimestamp(),
            type: `Pembelian Paket ${packageId.toUpperCase()}`,
            amount: -selectedPackage.price,
            status: "Sukses",
        });
        
        return { success: true, message: "Pembelian paket berhasil!" };
    });
});
