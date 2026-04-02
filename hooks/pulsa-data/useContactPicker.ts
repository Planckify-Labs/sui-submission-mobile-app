import * as Contacts from "expo-contacts";
import { useCallback } from "react";
import { Alert } from "react-native";

const MAX_CONTACTS_TO_SHOW = 5;

interface UseContactPickerOptions {
  onPhoneSelected: (phone: string) => void;
}

export function useContactPicker({ onPhoneSelected }: UseContactPickerOptions) {
  const pickContact = useCallback(async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant contacts permission to select a phone number.",
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
      });

      if (data.length === 0) {
        Alert.alert("No Contacts", "No contacts found.");
        return;
      }

      const contactsWithPhone = data.filter(
        (contact) => contact.phoneNumbers && contact.phoneNumbers.length > 0,
      );

      if (contactsWithPhone.length === 0) {
        Alert.alert("No Contacts", "No contacts with phone numbers found.");
        return;
      }

      Alert.alert("Select Contact", "Choose a contact:", [
        ...contactsWithPhone.slice(0, MAX_CONTACTS_TO_SHOW).map((contact) => ({
          text: contact.name || "Unknown",
          onPress: () => {
            const phone = contact.phoneNumbers?.[0]?.number;
            if (phone) {
              onPhoneSelected(phone);
            }
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    } catch (error) {
      console.error("Error accessing contacts:", error);
      Alert.alert("Error", "Failed to access contacts.");
    }
  }, [onPhoneSelected]);

  return { pickContact };
}
