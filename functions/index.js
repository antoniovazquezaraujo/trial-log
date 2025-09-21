const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();

exports.inviteUserToGroup = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
      console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.');
      res.status(403).json({ error: { message: 'Unauthorized' } });
      return;
    }

    let idToken;
    try {
        idToken = req.headers.authorization.split('Bearer ')[1];
        const decodedIdToken = await admin.auth().verifyIdToken(idToken);
        const callerUid = decodedIdToken.uid;
        const { identifier, groupId, role } = req.body.data;

        if (!identifier || !groupId) {
            res.status(400).json({ error: { message: "The function must be called with 'identifier' and 'groupId' arguments." } });
            return;
        }

        const db = admin.firestore();
        const groupRef = db.collection("groups").doc(groupId);
        const groupDoc = await groupRef.get();

        if (!groupDoc.exists) {
            res.status(404).json({ error: { message: "Group not found." } });
            return;
        }

        const groupData = groupDoc.data();
        if (groupData.members[callerUid] !== "admin") {
            res.status(403).json({ error: { message: "You must be an admin to invite users." } });
            return;
        }

        let userRecord;
        try {
            if (identifier.includes('@')) {
                userRecord = await admin.auth().getUserByEmail(identifier);
            } else {
                userRecord = await admin.auth().getUserByPhoneNumber(identifier);
            }
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                res.status(404).json({ error: { message: `No user found with the identifier ${identifier}.` } });
                return;
            }
            throw error; // Rethrow other errors
        }
        
        const invitedUid = userRecord.uid;

        if (groupData.members[invitedUid]) {
            res.status(409).json({ error: { message: "This user is already a member of the group." } });
            return;
        }

        await groupRef.update({
            [`members.${invitedUid}`]: role || "reader",
            memberIds: admin.firestore.FieldValue.arrayUnion(invitedUid)
        });

        res.status(200).json({ data: { message: `Success! ${identifier} has been invited to the group.` } });

    } catch (error) {
        console.error("Error inviting user:", error);
        res.status(500).json({ error: { message: "An unexpected error occurred." } });
    }
  });
});

exports.deleteGroup = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        res.status(403).json({ error: { message: 'Unauthorized' } });
        return;
    }

    let idToken;
    try {
        idToken = req.headers.authorization.split('Bearer ')[1];
        const decodedIdToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedIdToken.uid;
        const { groupId } = req.body.data;

        if (!groupId) {
            res.status(400).json({ error: { message: 'Group ID is required.' } });
            return;
        }

        const db = admin.firestore();
        const groupRef = db.collection('groups').doc(groupId);
        const groupDoc = await groupRef.get();

        if (!groupDoc.exists) {
            res.status(404).json({ error: { message: 'Group not found.' } });
            return;
        }

        const groupData = groupDoc.data();

        if (groupData.owner !== uid || Object.keys(groupData.members).length !== 1) {
            res.status(403).json({ error: { message: 'You do not have permission to delete this group.' } });
            return;
        }

        const songsRef = groupRef.collection('songs');
        const songsSnapshot = await songsRef.get();
        const songDeletions = songsSnapshot.docs.map(doc => doc.ref.delete());

        const rehearsalsRef = groupRef.collection('rehearsals');
        const rehearsalsSnapshot = await rehearsalsRef.get();
        const rehearsalDeletions = rehearsalsSnapshot.docs.map(doc => doc.ref.delete());

        await Promise.all([...songDeletions, ...rehearsalDeletions]);
        await groupRef.delete();

        res.status(200).json({ data: { message: 'Group deleted successfully.' } });

    } catch (error) {
        console.error("Error deleting group:", error);
        res.status(500).json({ error: { message: 'An unexpected error occurred.', details: error.message } });
    }
  });
});
