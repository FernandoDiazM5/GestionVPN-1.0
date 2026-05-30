import { useState, useEffect } from 'react';
import { formatCountdown } from '../../utils';

function CountdownDisplay({ expiry }: { expiry: number }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => setTime(formatCountdown(expiry - Date.now()));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return <span>{time}</span>;
}

export default CountdownDisplay;
