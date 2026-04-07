import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export interface ParsingState {
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  uploadProgress: number;
  parsingProgress: number;
  error: string | null;
  articleId: string | null;
  contentBlocks: any[];
  toc: any[];
  footnotes: any[];
}

export interface UploadMetadata {
  conferenceId: string;
  publicationType: 'abstract' | 'poster' | 'presentation';
  userId: string;
}

const INITIAL_STATE: ParsingState = {
  status: 'idle',
  progress: 0,
  uploadProgress: 0,
  parsingProgress: 0,
  error: null,
  articleId: null,
  contentBlocks: [],
  toc: [],
  footnotes: []
};

export const useDocumentParsingState = (metadata: UploadMetadata) => {
  const [state, setState] = useState<ParsingState>(INITIAL_STATE);
  const [unsubscribe, setUnsubscribe] = useState<Unsubscribe | null>(null);

  // 정리 함수
  useEffect(() => {
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [unsubscribe]);

  // 파일 업로드 및 파싱 시작
  const uploadDocument = useCallback(async (file: File): Promise<string> => {
    setState({
      ...INITIAL_STATE,
      status: 'uploading',
      uploadProgress: 0
    });

    try {
      // 1. Storage에 파일 업로드
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(
        storage, 
        `documents/${metadata.conferenceId}/${fileName}`
      );

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        customMetadata: {
          conferenceId: metadata.conferenceId,
          publicationType: metadata.publicationType,
          userId: metadata.userId,
          originalFileName: file.name
        }
      });

      // 업로드 진행률 모니터링
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setState(prev => ({
            ...prev,
            uploadProgress: progress,
            progress: progress / 2 // 업로드가 전체 진행률의 50%
          }));
        },
        (error) => {
          console.error('Upload error:', error);
          setState(prev => ({
            ...prev,
            status: 'error',
            error: '파일 업로드에 실패했습니다.'
          }));
        },
        async () => {
          // 업로드 완료 후 파싱 상태 모니터링 시작
          try {
            await getDownloadURL(uploadTask.snapshot.ref);

            setState(prev => ({
              ...prev,
              status: 'processing',
              uploadProgress: 100,
              progress: 50
            }));

            // Cloud Function이 문서를 생성할 때까지 대기
            // 실제로는 Storage trigger가 작동하므로, 생성된 문서를 찾을 때까지 폴링
            await waitForParsingCompletion();
            
          } catch (error) {
            console.error('Download URL error:', error);
            setState(prev => ({
              ...prev,
              status: 'error',
              error: '파일 처리에 실패했습니다.'
            }));
          }
        }
      );

      return fileName;
      
    } catch (error) {
      console.error('Upload error:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : '업로드에 실패했습니다.'
      }));
      throw error;
    }
  }, [metadata]);

  // 파싱 완료 대기 및 문서 모니터링
  const waitForParsingCompletion = useCallback(async () => {
    // 동일한 originalFileName을 가진 문서를 찾을 때까지 폴링
    let attempts = 0;

    const pollInterval = setInterval(async () => {
      attempts++;
      
      try {
        // 실제로는 Firestore에서 해당 파일 이름으로 생성된 문서를 찾아야 함
        // 여기서는 간단한 예시를 위해 쿼리 대신 타임아웃 방식 사용
        if (attempts >= 5) { // 데모용: 5초 후 완료 가정
          clearInterval(pollInterval);
          
          // 실제 환경에서는 여기서 Firestore 쿼리로 생성된 문서를 찾음
          // const querySnapshot = await getDocs(
          //   query(collection(db, 'articles'), where('originalFileName', '==', fileName))
          // );
          
          // 데모용: 더미 데이터로 완료 상태 설정
          setState(prev => ({
            ...prev,
            status: 'completed',
            progress: 100,
            parsingProgress: 100,
            articleId: `article-${Date.now()}`,
            contentBlocks: [
              {
                id: 'block-1',
                type: 'heading',
                content: { text: '파싱 완료', level: 1 },
                order: 1
              }
            ],
            toc: [
              { id: 'toc-1', title: '파싱 완료', level: 1, blockId: 'block-1' }
            ],
            footnotes: []
          }));
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
      
      // 진행률 업데이트
      setState(prev => ({
        ...prev,
        parsingProgress: Math.min((attempts / 5) * 100, 90),
        progress: 50 + (Math.min((attempts / 5) * 100, 90) / 2)
      }));
      
    }, 1000);
  }, []);

  // 상태 리셋
  const resetState = useCallback(() => {
    if (unsubscribe) {
      unsubscribe();
      setUnsubscribe(null);
    }
    setState(INITIAL_STATE);
  }, [unsubscribe]);

  // 특정 문서 ID로 상태 구독
  const subscribeToArticle = useCallback((articleId: string) => {
    if (unsubscribe) {
      unsubscribe();
    }

    const articleRef = doc(db, 'articles', articleId);
    
    const newUnsubscribe = onSnapshot(articleRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        setState(prev => ({
          ...prev,
          status: 'completed',
          progress: 100,
          parsingProgress: 100,
          articleId: docSnap.id,
          contentBlocks: data.contentBlocks || [],
          toc: data.toc || [],
          footnotes: data.footnotes || []
        }));
      }
    }, (error) => {
      console.error('Snapshot error:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: '문서를 찾을 수 없습니다.'
      }));
    });

    setUnsubscribe(() => newUnsubscribe);
  }, [unsubscribe]);

  return {
    state,
    uploadDocument,
    subscribeToArticle,
    resetState
  };
};