import {
  View,
  Text,
  Pressable,
  FlatList,
  ListRenderItemInfo,
  TextInput,
} from "react-native";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorBoundaryProps, Redirect, useRouter } from "expo-router";
import SignOutButton from "@/components/SignOutButton";
import { Controller, useForm } from "react-hook-form";
import { useAuth, useSession } from "@clerk/clerk-expo";
import { Challenge } from "@prisma/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  daily_progress,
  useChallenges,
  useDailyProgress,
} from "@/lib/hooks/react-query";
import { queryClient } from "@/lib/util/react-query";
import SafeView from "@/components/SafeView";
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  getDate,
  getDay,
  isSameDay,
  isWithinInterval,
  startOfDay,
  subDays,
} from "date-fns";
import { createCalendarDates, gridData, isDateValid } from "@/lib/util/dates";
import {
  DailyProgressOptionalDefaults,
  DailyProgressOptionalDefaultsSchema,
  DailyProgressSchema,
} from "@30-day-challenge/prisma-zod";
import { z } from "zod";
import ky, { HTTPError } from "ky";

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <SafeView
      top
      className="flex-1 flex justify-center items-center bg-red-600"
    >
      <Text>{props.error.message}</Text>
      <Text onPress={props.retry}>Try Again?</Text>
    </SafeView>
  );
}

export default function Page() {
  const {
    data: challengesData,
    error,
    isLoading: isChallengesLoading,
  } = useChallenges();
  const { isLoading: isDailyProgressDataLoading, data: temp } =
    useDailyProgress();

  if (isChallengesLoading || isDailyProgressDataLoading)
    return <Text>Challenges data is loading...</Text>;

  if (!challengesData || challengesData.length === 0)
    return <Redirect href={"/new-challenge-form"} />;

  return (
    <View className="w-5/6 mx-auto">
      <Calendar />
    </View>
  );
}

function Calendar() {
  const { data: challengesData } = useChallenges();
  const { data: dailyProgressData } = useDailyProgress();

  if (dailyProgressData == undefined) throw new Error();

  const challenge = challengesData![0];
  const gridData = createCalendarDates(challenge, dailyProgressData);

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="text-xl font-bold tracking-tight">
          Your Challenge:
        </Text>
        <View className="gap-2">
          <View>
            <Text className="font-bold">Title:</Text>
            <Text>{challenge.title}</Text>
          </View>
          <View>
            <Text className="font-bold">Wish:</Text>
            <Text>{challenge.wish}</Text>
          </View>
          <View>
            <Text className="font-bold">Daily action:</Text>
            <Text>{challenge.dailyAction}</Text>
          </View>
        </View>
      </View>
      <FlatList
        data={gridData}
        renderItem={(item) => <Day {...item} />}
        numColumns={7}
        className="bg-slate-400 p-[1px]"
      />
    </View>
  );
}

function Day({
  index,
  item,
  separators,
}: ListRenderItemInfo<gridData[number]>) {
  const { data: challengesData } = useChallenges();
  const { userId } = useAuth();

  const { mutate } = useMutation({
    mutationFn: mutateDailyProgress,
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["daily-progress"] });
      const previousDailyProgress = queryClient.getQueryData([
        "daily-progress",
      ]);
      queryClient.setQueryData(
        ["daily-progress"],
        (oldData: daily_progress) => [...oldData, data]
      );

      return { previousDailyProgress };
    },
    onError: (err, data, context) => {
      queryClient.setQueryData(
        ["daily-progress"],
        context?.previousDailyProgress
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-progress"] });
    },
  });

  type reqBody = Omit<DailyProgressOptionalDefaults, "userId"> & {
    clerkId: string;
  };
  async function mutateDailyProgress(reqBody: reqBody) {
    const response = await ky
      .put(
        `${process.env.EXPO_PUBLIC_NEXTJS_URL}/api/modify-progress-completion`,
        { json: reqBody, retry: 0 }
      )
      .json()
      .catch((e) =>
        console.error(
          "Something went wrong when modifying progress completion:",
          e
        )
      );

    const ResponseSchema = z.object({
      message: z.string(),
      data: DailyProgressSchema,
    });

    try {
      const { data } = ResponseSchema.parse(response);
      return data;
    } catch (error) {
      console.error("Validation failed:", error);
      throw new Error();
    }
  }

  function handlePress() {
    const reqBody: reqBody = {
      id: item.dailyProgress?.id || undefined,
      clerkId: userId!,
      date: item.dateValue,
      completed: item.dailyProgress?.completed == true ? false : true,
      challengeId: challengesData![0].id,
    };

    mutate(reqBody);
  }

  return (
    <Pressable
      className={`m-[1px] flex-1 aspect-square ${
        !isDateValid(item.dateValue, challengesData![0].startDate) &&
        !item.isPadding
          ? "bg-neutral-200"
          : item.dailyProgress?.completed
          ? "bg-green-500"
          : "bg-white"
      }`}
      key={index}
      onPress={handlePress}
      disabled={!isDateValid(item.dateValue, challengesData![0].startDate)}
    >
      <Text
        className={item.isPadding ? "text-neutral-500" : "text-black font-bold"}
      >
        {getDate(item.dateValue)}
      </Text>
    </Pressable>
  );
}
