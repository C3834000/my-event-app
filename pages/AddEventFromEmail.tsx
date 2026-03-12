import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { CheckCircle, Loader } from 'lucide-react';

const AddEventFromEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addEvent } = useApp();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [eventTitle, setEventTitle] = useState('');

  useEffect(() => {
    const addEventFromParams = () => {
      try {
        const dataStr = searchParams.get('data');
        if (!dataStr) {
          setStatus('error');
          return;
        }

        const eventData = JSON.parse(decodeURIComponent(dataStr));
        setEventTitle(eventData.title || 'אירוע');

        addEvent(eventData);

        console.log('✅ אירוע נוסף מהמייל:', eventData);
        setStatus('success');

        setTimeout(() => {
          navigate('/events');
        }, 2000);
      } catch (error) {
        console.error('❌ שגיאה בהוספת אירוע:', error);
        setStatus('error');
      }
    };

    addEventFromParams();
  }, [searchParams, addEvent, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-2xl p-12 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader className="w-16 h-16 text-purple-600 mx-auto mb-6 animate-spin" />
            <h1 className="text-2xl font-black text-slate-800 mb-2">מוסיף אירוע...</h1>
            <p className="text-slate-600">אנא המתן רגע</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-6" />
            <h1 className="text-2xl font-black text-slate-800 mb-2">האירוע נוסף בהצלחה!</h1>
            <p className="text-slate-600 mb-4">"{eventTitle}" נוסף ללוח אירועים</p>
            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <p className="text-green-800 font-bold text-sm">מעביר אותך ללוח אירועים...</p>
            </div>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">❌</span>
            </div>
            <h1 className="text-2xl font-black text-slate-800 mb-2">שגיאה בהוספת אירוע</h1>
            <p className="text-slate-600 mb-6">לא הצלחנו להוסיף את האירוע</p>
            <button
              onClick={() => navigate('/events')}
              className="bg-purple-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-purple-700 transition-all"
            >
              חזור ללוח אירועים
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AddEventFromEmail;
