import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../App.jsx';
import { Avatar, Menu, MenuItem } from './ui.jsx';

export default function UserMenu() {
  const { user, signOut } = useAuth();
  return (
    <Menu trigger={({ toggle }) => (
      <button className="user-chip" onClick={toggle} aria-label="Account menu">
        <Avatar user={user} size={24} />
        <span className="user-chip-name">{user.name.split(' ')[0]}</span>
        <ChevronDown size={13} />
      </button>
    )}>
      <div className="menu-header">
        <strong>{user.name}</strong>
        <small>{user.email}</small>
      </div>
      <MenuItem icon={LogOut} onClick={signOut}>Sign out</MenuItem>
    </Menu>
  );
}
