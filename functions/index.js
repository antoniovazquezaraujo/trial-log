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
    idToken = req.headers.authorization.split('Bearer ')[1];
    
    let decodedIdToken;
    try {
        decodedIdToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
        console.error('Error while verifying Firebase ID token:', error);
        res.status(403).json({ error: { message: 'Unauthorized' } });
        return;
    }

    const callerUid = decodedIdToken.uid;
    const { email, groupId, role } = req.body.data;

    if (!email || !groupId) {
      res.status(400).json({ error: { message: "The function must be called with 'email' and 'groupId' arguments." } });
      return;
    }

    const db = admin.firestore();

    try {
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

      const userRecord = await admin.auth().getUserByEmail(email);
      const invitedUid = userRecord.uid;

      if (groupData.members[invitedUid]) {
        res.status(409).json({ error: { message: "This user is already a member of the group." } });
        return;
      }

      await groupRef.update({
        [`members.${invitedUid}`]: role || "reader",
      });

      res.status(200).json({ data: { message: `Success! ${email} has been invited to the group.` } });

    } catch (error) {
      console.error("Error inviting user:", error);
      if (error.code === 'auth/user-not-found') {
          res.status(404).json({ error: { message: `No user found with the email ${email}.` } });
          return;
      }
      res.status(500).json({ error: { message: "An unexpected error occurred." } });
    }
  });
});
