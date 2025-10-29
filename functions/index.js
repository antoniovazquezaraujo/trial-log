const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.inviteUserToGroup = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const callerUid = context.auth.uid;
  const { identifier, groupId, role } = data;

  if (!identifier || !groupId) {
    throw new functions.https.HttpsError('invalid-argument', "The function must be called with 'identifier' and 'groupId' arguments.");
  }

  const db = admin.firestore();
  const groupRef = db.collection("groups").doc(groupId);
  const groupDoc = await groupRef.get();

  if (!groupDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Group not found.');
  }

  const groupData = groupDoc.data();
  if (groupData.members[callerUid] !== "admin") {
    throw new functions.https.HttpsError('permission-denied', 'You must be an admin to invite users.');
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
      throw new functions.https.HttpsError('not-found', `No user found with the identifier ${identifier}.`);
    } else if (error.code === 'auth/invalid-phone-number') {
      throw new functions.https.HttpsError('invalid-argument', 'El número de teléfono debe estar en formato E.164.');
    }
    console.error(error);
    throw new functions.https.HttpsError('internal', 'An unexpected error occurred looking up the user.');
  }
  
  const invitedUid = userRecord.uid;

  if (groupData.members[invitedUid]) {
    throw new functions.https.HttpsError('already-exists', 'This user is already a member of the group.');
  }

  await groupRef.update({
    [`members.${invitedUid}`]: role || "reader",
    memberIds: admin.firestore.FieldValue.arrayUnion(invitedUid)
  });

  return { message: `Success! ${identifier} has been invited to the group.` };
});

exports.deleteGroup = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const uid = context.auth.uid;
  const { groupId } = data;

  if (!groupId) {
    throw new functions.https.HttpsError('invalid-argument', 'Group ID is required.');
  }

  const db = admin.firestore();
  const groupRef = db.collection('groups').doc(groupId);
  const groupDoc = await groupRef.get();

  if (!groupDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Group not found.');
  }

  const groupData = groupDoc.data();

  if (groupData.owner !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'You do not have permission to delete this group.');
  }

  if (Object.keys(groupData.members).length > 1) {
    throw new functions.https.HttpsError('permission-denied', 'You can only delete groups if you are the only member. Please remove other members first.');
  }

  const songsRef = groupRef.collection('songs');
  const songsSnapshot = await songsRef.get();
  const songDeletions = songsSnapshot.docs.map(doc => doc.ref.delete());

  const rehearsalsRef = groupRef.collection('rehearsals');
  const rehearsalsSnapshot = await rehearsalsRef.get();
  const rehearsalDeletions = rehearsalsSnapshot.docs.map(doc => doc.ref.delete());

  await Promise.all([...songDeletions, ...rehearsalDeletions]);
  await groupRef.delete();

  return { message: 'Group deleted successfully.' };
});