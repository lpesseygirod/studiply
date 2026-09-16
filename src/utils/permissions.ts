import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking } from 'react-native';

// -------------------------------------------------------------------
// requestCameraPermission
// -------------------------------------------------------------------
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status === 'granted') return true;

  Alert.alert(
    'Camera Access Needed',
    'Studiply needs camera access to take photos of whiteboards and slides.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
  return false;
}

// -------------------------------------------------------------------
// requestMediaLibraryPermission
// -------------------------------------------------------------------
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'granted') return true;

  Alert.alert(
    'Photo Library Access Needed',
    'Studiply needs access to your photo library to upload images.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
  return false;
}
