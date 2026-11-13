"use client";

import { useContext, useState } from "react";

import Remark from "./Remark";

import dynamic from "next/dynamic";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
// import Lottie from "lottie-react";

import UserApiForm from "./UserApiForm";

import { ImGift } from "react-icons/im";
import { MdOutlineCalculate } from "react-icons/md";

import Link from "next/link";
import Saving from "../../../public/lottie/saving.json";
import Button from "./Button";
import { FaEye } from "react-icons/fa6";
import Badge from "./Badge";
import { UserContext } from "@/context/user";
import { usePathname } from "next/navigation";

export type ErrorType = Record<string, string>;

const UserApi = () => {
  const [open, setOpen] = useState(false);
  const { value, setValue } = useContext(UserContext);
  const pathname = usePathname().replace(/\/$/, "");

  return (
    <>
      <p>
        It&apos;s always FREE to use the exclusive features of the Octoprice
        App, but in order to obtain{" "}
        <strong>your actual consumption data</strong>, you will need to:
      </p>
      <ol className="list-decimal ml-5 flex flex-col gap-5 mt-4">
        <li>
          be an <span className="text-3xl">Octopus Energy user</span>
          <Remark>
            The results will be more accurate if you have been an Octopus user
            for at least several months, better if over a year - if you are not
            a current Octopus Energy user, you can switch now and wait for a
            month to use this service.
          </Remark>
        </li>
        <li>
          <div className="inline-flex items-start lg:items-center gap-2 flex-col lg:flex-row ">
            <UserApiForm open={open} setOpen={setOpen} />
            <div>
              your Octopus account information
              <Remark>
                The account information is used to retrieve your energy usage
                details for cost calcuation. Please be assured that all your
                account information will be stored on your browser only and will
                NOT be shared with us.
              </Remark>
            </div>
          </div>
        </li>
      </ol>
      {pathname !== "/dashboard" && (
        <div className="p-6 mt-16 border border-dotted border-accentPink-900 bg-black/30 rounded-xl">
          <p className="pb-4">
            <Badge
              variant="primary"
              label="NEW"
              className="text-sm px-1 py-1 mr-2"
            />{" "}
            <em>Not yet an Octopus user or feeling sceptical?</em> Just try it
            out with synthetic sample consumption data:
          </p>
          <Button
            variant="action"
            clickHandler={() => {
              setValue({ ...value, testRun: true });
            }}
            className="flex text-accentPink-600 gap-2 items-center px-8 rounded-xl bg-theme-950 hover:bg-accentPink-600 hover:text-white group"
          >
            <FaEye
              className="w-6 h-6 text-accentPink-600 group-hover:text-accentPink-300"
              aria-label="click to enter account information"
            />
            Try it Out (no info needed)
          </Button>
        </div>
      )}
      <div className="flex flex-col p-2 md:py-6 md:flex-row items-center bg-theme-900 mt-20 ">
        <div className="w-[100px] md:min-w-[200px] flex items-center justify-center">
          <Lottie
            animationData={Saving}
            aria-hidden={true}
            loop={true}
            className="w-[150px] h-[150px]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-accentPink-300">Not an Octopus Energy user?</p>

          <p>
            Swap today for 100% renewable energy and award winning customer
            service! And you can switch out anytime without penalties.
          </p>
          <p>
            <MdOutlineCalculate className="inline-block w-6 h-6 text-accentBlue-500 mr-2" />
            <Link
              href="/switch"
              className="underline text-accentPink-500 hover:no-underline hover:text-accentBlue-500"
            >
              calculate how much exactly you can save with this tool
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default UserApi;
