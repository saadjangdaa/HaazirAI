import { collection, addDoc } from "firebase/firestore";
import { db } from "../app/lib/firebase"; // check path later if needed

export async function testFirestore() {
  try {
    const docRef = await addDoc(collection(db, "test"), {
      message: "Firebase connected successfully",
      createdAt: new Date(),
    });

    console.log("Firestore Success ID:", docRef.id);
  } catch (error) {
    console.log("Firestore Error:", error);
  }
}