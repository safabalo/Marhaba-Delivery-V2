import { registerRootComponent } from 'expo';
import App from './App';

// Ensure the background location task is registered at startup.
import './src/lib/location';

registerRootComponent(App);
